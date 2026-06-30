import { useMemo, useState } from 'react';
import { Landmark, Wallet } from 'lucide-react';
import { MonthFilter } from '@/components/MonthFilter';
import { Card } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import {
  bankCategoryOptions,
  formatDate,
  formatMoney,
  formatMonth,
} from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useBankAccounts,
  useBankMonthly,
  useBankTransactions,
  useBankTransactionMonths,
  useSetTransactionCategory,
} from '@/hooks/useFinance';
import { BankCategoryBreakdown } from './BankCategoryBreakdown';

export function BanksTab({ organizationId }: { organizationId?: string }) {
  const [bankAccountId, setBankAccountId] = useState('');
  const [month, setMonth] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const setCategoryMut = useSetTransactionCategory();

  const accounts = useBankAccounts(organizationId);
  const months = useBankTransactionMonths({
    organizationId,
    bankAccountId: bankAccountId || undefined,
  });
  const movements = useBankTransactions({
    organizationId,
    bankAccountId: bankAccountId || undefined,
    month,
    search: search || undefined,
    category: category || undefined,
  });
  const monthly = useBankMonthly({
    organizationId,
    bankAccountId: bankAccountId || undefined,
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
    () => Math.max(0, ...(monthly.data ?? []).map((m) => m.closingBalance)),
    [monthly.data],
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

      {/* Evolución mensual de caja */}
      {monthly.isLoading && <Spinner label="Cargando evolución…" />}
      {monthly.data && monthly.data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              Evolución mensual
            </h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Saldo al cierre de cada mes según las cartolas cargadas.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Mes</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo al cierre</th>
                  <th className="px-4 py-3 text-right font-medium">Flujo neto</th>
                  <th className="px-4 py-3 text-right font-medium">Abonos</th>
                  <th className="px-4 py-3 text-right font-medium">Cargos</th>
                  <th className="px-4 py-3 font-medium">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {monthly.data.map((m) => (
                  <tr key={m.month} className="hover:bg-[var(--color-muted)]/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-foreground)]">
                      {formatMonth(m.month)}
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
        month={month}
      />

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-5xl lg:grid-cols-4">
        <Select
          options={accountOptions}
          placeholder="Todas las cuentas"
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
        />
        <MonthFilter
          months={months.data ?? []}
          value={month}
          onChange={setMonth}
        />
        <Select
          options={[{ value: '__none__', label: 'Sin categoría' }, ...bankCategoryOptions]}
          placeholder="Todas las categorías"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Input
          placeholder="Buscar descripción…"
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

      {movements.data && movements.data.transactions.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  {showAccountColumn && (
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                  )}
                  <th className="px-4 py-3 font-medium">Canal / Doc.</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 text-right font-medium">Cargo</th>
                  <th className="px-4 py-3 text-right font-medium">Abono</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {movements.data.transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--color-muted)]/40">
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
                      <div className="flex items-center gap-1">
                        <Select
                          className="h-8 min-w-[150px] text-xs"
                          options={[{ value: '', label: 'Sin categoría' }, ...bankCategoryOptions]}
                          value={t.category ?? ''}
                          onChange={(e) =>
                            setCategoryMut.mutate({ id: t.id, category: e.target.value || null })
                          }
                        />
                        {t.categoryManual && (
                          <span title="Ajustada manualmente" className="text-[var(--color-muted-foreground)]">•</span>
                        )}
                      </div>
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
                      colSpan={showAccountColumn ? 5 : 4}
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
    </div>
  );
}
