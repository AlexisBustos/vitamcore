import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/domain';
import { periodLabel, periodShortLabel } from '@/lib/period';
import { getErrorMessage } from '@/lib/errors';
import { useFinanceTrend, type Granularity } from '@/hooks/useFinance';

const CHART_H = 150; // altura útil de las barras, en px

export function TrendTab({ organizationId }: { organizationId?: string }) {
  const [granularity, setGranularity] = useState<Granularity>('week');
  const last = granularity === 'week' ? 12 : 12;

  const { data, isLoading, isError, error } = useFinanceTrend({
    granularity,
    last,
    organizationId,
  });

  const titulo =
    granularity === 'week' ? 'Tendencia · últimas 12 semanas' : 'Tendencia · últimos 12 meses';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Evolución de ingresos, gastos y resultado período a período. Un hueco en la serie
          (barras en cero) es información: significa que ahí no hubo movimiento.
        </p>
        <div className="inline-flex shrink-0 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
          {(['week', 'month'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={
                granularity === g
                  ? 'rounded-md px-3 py-1 text-sm font-medium bg-[var(--color-primary)] text-white transition-colors'
                  : 'rounded-md px-3 py-1 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors'
              }
            >
              {g === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <ErrorState message={getErrorMessage(error)} />
      ) : data.length === 0 ? (
        <EmptyState title="Sin datos de tendencia" />
      ) : (
        <TrendContent titulo={titulo} points={data} />
      )}
    </div>
  );
}

function TrendContent({
  titulo,
  points,
}: {
  titulo: string;
  points: { period: string; income: number; expense: number; result: number }[];
}) {
  const totalIncome = points.reduce((s, p) => s + p.income, 0);
  const totalExpense = points.reduce((s, p) => s + p.expense, 0);
  const netResult = totalIncome - totalExpense;

  // Escala común para ingresos y gastos (mismo eje para comparar de un vistazo).
  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Ingresos del período" value={formatMoney(totalIncome)} tone="success" />
        <MetricCard title="Gastos del período" value={formatMoney(totalExpense)} tone="danger" />
        <MetricCard
          title="Resultado del período"
          value={formatMoney(netResult)}
          tone={netResult >= 0 ? 'success' : 'danger'}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{titulo}</CardTitle>
          <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-success)]" /> Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-danger)]" /> Gastos
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div
              className="flex items-end gap-3"
              style={{ height: CHART_H + 44, minWidth: points.length * 44 }}
            >
              {points.map((p) => {
                const hIncome = Math.round((p.income / max) * CHART_H);
                const hExpense = Math.round((p.expense / max) * CHART_H);
                const tooltip = `${periodLabel(p.period)}\nIngresos: ${formatMoney(
                  p.income,
                )}\nGastos: ${formatMoney(p.expense)}\nResultado: ${formatMoney(p.result)}`;
                return (
                  <div
                    key={p.period}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={tooltip}
                  >
                    <div className="flex items-end gap-1" style={{ height: CHART_H }}>
                      <div
                        className="w-3 rounded-t bg-[var(--color-success)] transition-all"
                        style={{ height: Math.max(hIncome, p.income > 0 ? 2 : 0) }}
                      />
                      <div
                        className="w-3 rounded-t bg-[var(--color-danger)] transition-all"
                        style={{ height: Math.max(hExpense, p.expense > 0 ? 2 : 0) }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-[var(--color-muted-foreground)]">
                      {periodShortLabel(p.period)}
                    </span>
                    <span
                      className={
                        p.result >= 0
                          ? 'text-[10px] font-medium text-[var(--color-success)]'
                          : 'text-[10px] font-medium text-[var(--color-danger)]'
                      }
                    >
                      {shortMoney(p.result)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/// Monto abreviado para etiquetas apretadas: 1.250.000 → "1,3M", 45.000 → "45k".
function shortMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
