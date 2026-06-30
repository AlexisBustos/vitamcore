import { useMemo, useState } from 'react';
import { Landmark, Wallet } from 'lucide-react';
import { MonthFilter } from '@/components/MonthFilter';
import { Card } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useBankAccounts,
  useBankTransactions,
  useBankTransactionMonths,
} from '@/hooks/useFinance';

export function BanksTab({ organizationId }: { organizationId?: string }) {
  const [bankAccountId, setBankAccountId] = useState('');
  const [month, setMonth] = useState<string | undefined>();
  const [search, setSearch] = useState('');

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
          hint={`${accounts.data.length} cuenta(s)`}
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

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-3">
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
                      colSpan={showAccountColumn ? 4 : 3}
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
