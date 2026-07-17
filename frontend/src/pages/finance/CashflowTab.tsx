import { useState } from 'react';
import { AlertTriangle, CheckCircle2, TrendingDown, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useCashflow } from '@/hooks/useFinance';

const HORIZONS = [4, 8, 12];

export function CashflowTab({ organizationId }: { organizationId?: string }) {
  const [weeks, setWeeks] = useState(8);
  const { data, isLoading, isError, error } = useCashflow(organizationId, weeks);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

  const hasRecurring = data.weeks.some((w) => w.recurringIn > 0 || w.recurringOut > 0);
  const overdueTotal = data.overdueFoldedIn.receivable + data.overdueFoldedIn.payable;
  const rango = (startDate: string, endDate: string) =>
    `${formatDate(startDate)} – ${formatDate(endDate)}`;

  return (
    <div className="space-y-6">
      {/* Selector de horizonte */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Proyección de caja a {data.horizonWeeks} semanas desde el saldo bancario actual.
        </p>
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setWeeks(h)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                weeks === h
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              )}
            >
              {h} sem
            </button>
          ))}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Saldo en bancos (hoy)" value={formatMoney(data.startingCash)} icon={Wallet} />
        <MetricCard
          title="Saldo mínimo proyectado"
          value={formatMoney(data.minBalance)}
          hint={data.minBalanceWeek ? `Semana ${data.minBalanceWeek}` : undefined}
          icon={TrendingDown}
          tone={data.minBalance < 0 ? 'danger' : 'default'}
        />
        <MetricCard
          title="Vencidos incluidos"
          value={formatMoney(overdueTotal)}
          hint="Plegados a la primera semana"
          tone={overdueTotal > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Banner de quiebre / tranquilidad */}
      {data.firstShortfallWeek ? (
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" />
          <div className="text-sm">
            <p className="font-medium text-[var(--color-danger)]">
              Quiebre de caja proyectado en la semana {data.firstShortfallWeek}
            </p>
            <p className="text-[var(--color-muted-foreground)]">
              El saldo proyectado cae por debajo de cero. Anticipa cobranza o posterga pagos
              para evitar quedarte corto.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
          <div className="text-sm">
            <p className="font-medium text-[var(--color-success)]">
              Sin quiebres de caja en las próximas {data.horizonWeeks} semanas
            </p>
            <p className="text-[var(--color-muted-foreground)]">
              El saldo proyectado se mantiene positivo; el mínimo es {formatMoney(data.minBalance)}.
            </p>
          </div>
        </div>
      )}

      {/* Tabla semana a semana */}
      <Card>
        <CardHeader>
          <CardTitle>Proyección semanal</CardTitle>
        </CardHeader>
        <CardContent>
          {data.weeks.length === 0 ? (
            <EmptyState title="Sin datos para proyectar" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="py-2 font-medium">Semana</th>
                    <th className="py-2 text-right font-medium">Entradas</th>
                    <th className="py-2 text-right font-medium">Salidas</th>
                    <th className="py-2 text-right font-medium">Neto</th>
                    <th className="py-2 text-right font-medium">Saldo proyectado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.weeks.map((w) => {
                    const isMin = w.weekKey === data.minBalanceWeek;
                    const entradas = w.expectedIn + w.recurringIn;
                    const salidas = w.expectedOut + w.recurringOut;
                    return (
                      <tr key={w.weekKey} className={cn(isMin && 'bg-[var(--color-muted)]/40')}>
                        <td className="py-2">
                          <span className="font-medium text-[var(--color-foreground)]">{w.weekKey}</span>
                          <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                            {rango(w.startDate, w.endDate)}
                          </span>
                        </td>
                        <td className="py-2 text-right text-[var(--color-success)]">
                          {entradas ? formatMoney(entradas) : '—'}
                        </td>
                        <td className="py-2 text-right text-[var(--color-danger)]">
                          {salidas ? formatMoney(salidas) : '—'}
                        </td>
                        <td className="py-2 text-right text-[var(--color-muted-foreground)]">
                          {formatMoney(w.net)}
                        </td>
                        <td
                          className={cn(
                            'py-2 text-right font-semibold',
                            w.closingBalance < 0
                              ? 'text-[var(--color-danger)]'
                              : 'text-[var(--color-foreground)]',
                          )}
                        >
                          {formatMoney(w.closingBalance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            Proyección de caja (no contable): usa las fechas de vencimiento de cuentas por cobrar y
            por pagar{hasRecurring ? ' e incluye ocurrencias futuras de ingresos/gastos recurrentes' : ''}.
            Los montos vencidos se muestran en la primera semana.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
