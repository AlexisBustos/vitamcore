import { useEffect, useMemo, useState } from 'react';
import { Landmark, Wallet } from 'lucide-react';
import { PeriodFilter } from '@/components/PeriodFilter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import {
  bankKindClassName,
  formatDate,
  formatMoney,
} from '@/lib/domain';
import { periodLabel } from '@/lib/period';
import { getErrorMessage } from '@/lib/errors';
import {
  useBankAccounts,
  useBankCategories,
  useBankPeriodic,
  useBankTransactions,
  useBankTransactionPeriods,
  useBulkSetCategory,
  useSetTransactionCategory,
  type Granularity,
} from '@/hooks/useFinance';
import { BankCategoryBreakdown } from './BankCategoryBreakdown';
import { CategoryRulesPanel } from './CategoryRulesPanel';
import { CreateRuleFromMovement } from './CreateRuleFromMovement';

export function BanksTab({
  organizationId,
  initialReconciliation,
}: {
  organizationId?: string;
  initialReconciliation?: 'linked' | 'unlinked';
}) {
  const [bankAccountId, setBankAccountId] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [period, setPeriod] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [reconciliation, setReconciliation] = useState<'' | 'linked' | 'unlinked'>(
    initialReconciliation ?? '',
  );

  // Refleja el deep-link desde el Cuadre ("revisar" → Suelto).
  useEffect(() => {
    if (initialReconciliation) setReconciliation(initialReconciliation);
  }, [initialReconciliation]);

  const setCategoryMut = useSetTransactionCategory();

  const categoriesQuery = useBankCategories();
  const categoryOptions = (categoriesQuery.data ?? [])
    .filter((c) => c.active)
    .map((c) => ({ value: c.key, label: c.name }));
  const bulkSet = useBulkSetCategory();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);

  // Limpia la selección al cambiar de filtros para no arrastrar ids fuera de vista.
  useEffect(() => setSelected(new Set()), [bankAccountId, granularity, period, search, category, reconciliation]);

  // Al cambiar de granularidad, el período elegido deja de ser válido.
  useEffect(() => setPeriod(undefined), [granularity]);

  const accounts = useBankAccounts(organizationId);
  const periods = useBankTransactionPeriods({
    organizationId,
    bankAccountId: bankAccountId || undefined,
    granularity,
  });
  const movements = useBankTransactions({
    organizationId,
    bankAccountId: bankAccountId || undefined,
    granularity,
    period,
    search: search || undefined,
    category: category || undefined,
    reconciliation: reconciliation || undefined,
  });
  const periodic = useBankPeriodic({
    organizationId,
    bankAccountId: bankAccountId || undefined,
    granularity,
  });

  const accountOptions = useMemo(
    () =>
      (accounts.data ?? []).map((a) => ({
        value: a.id,
        label: `${a.name} · ${a.accountNumber}`,
      })),
    [accounts.data],
  );

  // Caja total = suma de saldos actuales de todas las cuentas (no afectada por
  // los filtros de la tabla; es la foto consolidada de caja).
  const totalCash = useMemo(
    () =>
      (accounts.data ?? []).reduce(
        (sum, a) => sum + (a.currentBalance ?? 0),
        0,
      ),
    [accounts.data],
  );

  // Fecha del último movimiento entre todas las cuentas (string ISO →
  // comparación lexicográfica, NO Math.max sobre el raw).
  const lastMovementDate = useMemo(() => {
    const dates = (accounts.data ?? [])
      .map((a) => a.lastMovementDate)
      .filter((d): d is string => Boolean(d));
    return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  }, [accounts.data]);

  const maxClosing = useMemo(
    () => Math.max(0, ...(periodic.data ?? []).map((m) => m.closingBalance)),
    [periodic.data],
  );

  const showAccountColumn = !bankAccountId;

  if (accounts.isLoading) return <Spinner label="Cargando cuentas…" />;
  if (accounts.isError)
    return <ErrorState message={getErrorMessage(accounts.error)} />;
  if (!accounts.data || accounts.data.length === 0) {
    return (
      <EmptyState title="Sin cuentas bancarias">
        Crea una cuenta y carga su cartola desde la pestaña{' '}
        <strong>Importaciones</strong> para ver aquí saldos y movimientos.
      </EmptyState>
    );
  }

  const totals = movements.data?.totals;

  return (
    <div className="space-y-5">
      {/* Tarjetas de saldo: caja total + una por cuenta */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Caja total"
          value={formatMoney(totalCash)}
          hint={
            lastMovementDate
              ? `${accounts.data.length} cuenta(s) · al ${formatDate(lastMovementDate)}`
              : `${accounts.data.length} cuenta(s)`
          }
          icon={Wallet}
          tone="success"
        />
        {accounts.data.map((a) => (
          <MetricCard
            key={a.id}
            title={a.name}
            value={formatMoney(a.currentBalance)}
            hint={
              a.lastMovementDate
                ? `${a.bankName ?? 'Banco'} · al ${formatDate(a.lastMovementDate)}`
                : (a.bankName ?? 'Sin movimientos')
            }
            icon={Landmark}
          />
        ))}
      </div>

      {/* Evolución de caja por período (mes o semana según el filtro) */}
      {periodic.isLoading && <Spinner label="Cargando evolución…" />}
      {periodic.data && periodic.data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              Evolución {granularity === 'week' ? 'semanal' : 'mensual'}
            </h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Saldo al cierre de cada {granularity === 'week' ? 'semana' : 'mes'}{' '}
              según las cartolas cargadas.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {granularity === 'week' ? 'Semana' : 'Mes'}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Saldo al cierre</th>
                  <th className="px-4 py-3 text-right font-medium">Flujo neto</th>
                  <th className="px-4 py-3 text-right font-medium">Abonos</th>
                  <th className="px-4 py-3 text-right font-medium">Cargos</th>
                  <th className="px-4 py-3 font-medium">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {periodic.data.map((m) => (
                  <tr key={m.period} className="hover:bg-[var(--color-muted)]/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-foreground)]">
                      {periodLabel(m.period)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(m.closingBalance)}
                    </td>
                    <td
                      className={
                        m.netFlow >= 0
                          ? 'px-4 py-3 text-right font-medium text-[var(--color-success)]'
                          : 'px-4 py-3 text-right font-medium text-[var(--color-danger)]'
                      }
                    >
                      {formatMoney(m.netFlow)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-success)]">
                      {m.credits ? formatMoney(m.credits) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-danger)]">
                      {m.charges ? formatMoney(m.charges) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-[var(--color-muted)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-primary)]"
                          style={{
                            width: `${
                              maxClosing > 0
                                ? Math.max(0, Math.min(100, (m.closingBalance / maxClosing) * 100))
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <BankCategoryBreakdown
        organizationId={organizationId}
        bankAccountId={bankAccountId || undefined}
        granularity={granularity}
        period={period}
      />

      {/* Acciones de categorías */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setPanelOpen(true)}>Gestionar categorías y reglas</Button>
      </div>

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-6xl lg:grid-cols-5">
        <Select
          options={accountOptions}
          placeholder="Todas las cuentas"
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
        />
        <PeriodFilter
          granularity={granularity}
          period={period}
          periods={periods.data ?? []}
          onGranularityChange={setGranularity}
          onPeriodChange={setPeriod}
        />
        <Select
          options={[{ value: '__none__', label: 'Sin categoría' }, ...categoryOptions]}
          placeholder="Todas las categorías"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Select
          options={[
            { value: 'linked', label: 'Conciliado' },
            { value: 'unlinked', label: 'Suelto' },
          ]}
          placeholder="Toda conciliación"
          value={reconciliation}
          onChange={(e) =>
            setReconciliation(e.target.value as '' | 'linked' | 'unlinked')
          }
        />
        <Input
          placeholder="Buscar descripción o contraparte…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Movimientos */}
      {movements.isLoading && <Spinner label="Cargando movimientos…" />}
      {movements.isError && (
        <ErrorState message={getErrorMessage(movements.error)} />
      )}
      {movements.data && movements.data.transactions.length === 0 && (
        <EmptyState title="Sin movimientos para los filtros seleccionados" />
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--color-muted)] px-3 py-2 text-sm">
          <span>{selected.size} seleccionados</span>
          <Select
            className="h-8 w-48"
            options={[{ value: '__none__', label: 'Sin categoría' }, ...categoryOptions]}
            placeholder="Asignar categoría…"
            value=""
            onChange={async (e) => {
              const raw = e.target.value;
              if (raw === '') return; // sigue sin selección
              const category = raw === '__none__' ? null : raw;
              try {
                await bulkSet.mutateAsync({ ids: [...selected], category });
                setSelected(new Set());
              } catch {
                // Mantiene la selección intacta si la asignación falla.
              }
            }}
          />
          <Button variant="outline" onClick={() => setSelected(new Set())}>Limpiar</Button>
        </div>
      )}

      {movements.data && movements.data.transactions.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            {/* Padding compacto (px-2) vía selector de hijos para que las 10
                columnas quepan en pantallas de laptop sin recortar "Saldo";
                el overflow-x-auto sigue como red de seguridad en anchos mínimos. */}
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={
                        (movements.data?.transactions.length ?? 0) > 0 &&
                        selected.size === movements.data?.transactions.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set((movements.data?.transactions ?? []).map((t) => t.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  {showAccountColumn && (
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                  )}
                  <th className="px-4 py-3 font-medium">Canal / Doc.</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Conciliación</th>
                  <th className="px-4 py-3 text-right font-medium">Cargo</th>
                  <th className="px-4 py-3 text-right font-medium">Abono</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {movements.data.transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--color-muted)]/40">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          e.target.checked ? next.add(t.id) : next.delete(t.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatDate(t.transactionDate)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
                      {t.description}
                    </td>
                    {showAccountColumn && (
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {t.bankAccount?.name ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {[t.channel, t.documentNumber]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative flex items-center gap-1">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${bankKindClassName(
                            (categoriesQuery.data ?? []).find((c) => c.key === t.category)?.kind,
                          )}`}
                          title="Tipo de la categoría"
                        />
                        <Select
                          className="h-8 min-w-[116px] text-xs"
                          options={[{ value: '', label: 'Sin categoría' }, ...categoryOptions]}
                          value={t.category ?? ''}
                          onChange={(e) =>
                            setCategoryMut.mutate({ id: t.id, category: e.target.value || null })
                          }
                        />
                        {t.categoryManual && (
                          <span title="Ajustada manualmente" className="text-[var(--color-muted-foreground)]">•</span>
                        )}
                        <CreateRuleFromMovement
                          description={t.description}
                          isCharge={t.chargeAmount > 0}
                          pinned={t.categoryManual}
                          categories={categoriesQuery.data ?? []}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.reconciled ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex w-fit items-center rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
                            Conciliado
                          </span>
                          {t.counterparties.length > 0 && (
                            <span
                              className="text-xs text-[var(--color-muted-foreground)]"
                              title={t.counterparties.join(', ')}
                            >
                              {t.counterparties.join(', ')}
                            </span>
                          )}
                        </div>
                      ) : t.internal ? (
                        <span className="inline-flex items-center rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                          Interno
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                          Suelto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-danger)]">
                      {t.chargeAmount ? formatMoney(t.chargeAmount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-success)]">
                      {t.creditAmount ? formatMoney(t.creditAmount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(t.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-muted)]/40 text-xs">
                  <tr>
                    <td
                      className="px-4 py-3 font-medium text-[var(--color-muted-foreground)]"
                      colSpan={showAccountColumn ? 7 : 6}
                    >
                      {totals.count} movimiento(s) · neto del período{' '}
                      <span
                        className={
                          totals.net >= 0
                            ? 'font-semibold text-[var(--color-success)]'
                            : 'font-semibold text-[var(--color-danger)]'
                        }
                      >
                        {formatMoney(totals.net)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--color-danger)]">
                      {formatMoney(totals.charges)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--color-success)]">
                      {formatMoney(totals.credits)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {/* Con una cuenta: saldo final real de la cartola. Con
                          todas: la caja consolidada (sumar saldos finales de
                          una lista mezclada no tendría sentido). */}
                      {formatMoney(
                        showAccountColumn ? totalCash : totals.endingBalance,
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      <CategoryRulesPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
