import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Repeat,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useFinanceSummary } from '@/hooks/useFinance';
import { ConsolidatedPosition } from './ConsolidatedPosition';

export function FinanceSummaryTab({ organizationId }: { organizationId?: string }) {
  const { data, isLoading, isError, error } = useFinanceSummary(organizationId);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

  return (
    <div className="space-y-6">
      <ConsolidatedPosition organizationId={organizationId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Ingresos del mes"
          value={formatMoney(data.monthIncome)}
          icon={ArrowUpRight}
          tone="success"
        />
        <MetricCard
          title="Gastos del mes"
          value={formatMoney(data.monthExpense)}
          icon={ArrowDownRight}
          tone="danger"
        />
        <MetricCard
          title="Resultado estimado"
          value={formatMoney(data.estimatedResult)}
          icon={Wallet}
          tone={data.estimatedResult >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Por cobrar"
          value={formatMoney(data.pendingIncome)}
        />
        <MetricCard
          title="Cobrado"
          value={formatMoney(data.collectedIncome)}
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          title="Gastos pendientes"
          value={formatMoney(data.pendingExpense)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="Ingresos recurrentes"
          value={formatMoney(data.recurringIncome)}
          icon={Repeat}
        />
        <MetricCard
          title="Gastos recurrentes"
          value={formatMoney(data.recurringExpense)}
          icon={Repeat}
        />
      </div>

      {(data.overdueIncome.count > 0 || data.overdueExpense.count > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            title="Ingresos vencidos"
            value={formatMoney(data.overdueIncome.amount)}
            hint={`${data.overdueIncome.count} registro(s)`}
            tone={data.overdueIncome.count > 0 ? 'danger' : 'default'}
          />
          <MetricCard
            title="Gastos vencidos"
            value={formatMoney(data.overdueExpense.amount)}
            hint={`${data.overdueExpense.count} registro(s)`}
            tone={data.overdueExpense.count > 0 ? 'danger' : 'default'}
          />
        </div>
      )}

      {/* Desglose por empresa */}
      <Card>
        <CardHeader>
          <CardTitle>Resultado por empresa</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byOrganization.length === 0 ? (
            <EmptyState title="Sin datos financieros" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="py-2 font-medium">Empresa</th>
                    <th className="py-2 text-right font-medium">Ingresos</th>
                    <th className="py-2 text-right font-medium">Gastos</th>
                    <th className="py-2 text-right font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.byOrganization.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 font-medium text-[var(--color-foreground)]">
                        {o.name}
                      </td>
                      <td className="py-2 text-right text-[var(--color-success)]">
                        {formatMoney(o.income)}
                      </td>
                      <td className="py-2 text-right text-[var(--color-danger)]">
                        {formatMoney(o.expense)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatMoney(o.result)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desglose por categoría */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryBreakdown title="Ingresos por categoría" items={data.incomeByCategory} />
        <CategoryBreakdown title="Gastos por categoría" items={data.expenseByCategory} />
      </div>

      {/* Vencimientos financieros próximos */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--color-accent)]" />
          <CardTitle>Vencimientos financieros próximos</CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcomingFinancial.length === 0 ? (
            <EmptyState title="Sin vencimientos próximos" />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {data.upcomingFinancial.map((f) => (
                <div key={`${f.kind}-${f.id}`} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">
                      {f.description}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {f.kind === 'INCOME' ? 'Ingreso' : 'Gasto'} · {f.organization.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={
                        f.kind === 'INCOME'
                          ? 'text-sm font-medium text-[var(--color-success)]'
                          : 'text-sm font-medium text-[var(--color-danger)]'
                      }
                    >
                      {formatMoney(f.amount)}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {formatDate(f.dueDate)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryBreakdown({
  title,
  items,
}: {
  title: string;
  items: { category: string; amount: number }[];
}) {
  const total = items.reduce((acc, i) => acc + i.amount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-2 text-sm text-[var(--color-muted-foreground)]">
            Sin datos.
          </p>
        ) : (
          <div className="space-y-2.5">
            {items.map((i) => (
              <div key={i.category}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-foreground)]">
                    {i.category}
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">
                    {formatMoney(i.amount)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)]"
                    style={{ width: total ? `${(i.amount / total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
