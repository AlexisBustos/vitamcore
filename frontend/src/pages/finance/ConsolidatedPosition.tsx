import { Wallet, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useFinancePosition } from '@/hooks/useFinance';

export function ConsolidatedPosition({
  organizationId,
}: {
  organizationId?: string;
}) {
  const { data, isLoading, isError, error } = useFinancePosition(organizationId);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Caja (bancos)" value={formatMoney(data.cash)} icon={Wallet} />
        <MetricCard
          title="Por cobrar"
          value={formatMoney(data.receivable)}
          icon={ArrowUpRight}
          tone="success"
        />
        <MetricCard
          title="Por pagar"
          value={formatMoney(data.payable)}
          icon={ArrowDownRight}
          tone="danger"
        />
        <MetricCard
          title="Posición"
          value={formatMoney(data.position)}
          icon={Scale}
          tone={data.position >= 0 ? 'success' : 'danger'}
          hint="Caja + Por cobrar − Por pagar"
        />
      </div>

      {data.byOrganization.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Posición por empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="py-2 font-medium">Empresa</th>
                    <th className="py-2 text-right font-medium">Caja</th>
                    <th className="py-2 text-right font-medium">Por cobrar</th>
                    <th className="py-2 text-right font-medium">Por pagar</th>
                    <th className="py-2 text-right font-medium">Posición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.byOrganization.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 font-medium text-[var(--color-foreground)]">
                        {o.name}
                      </td>
                      <td className="py-2 text-right">{formatMoney(o.cash)}</td>
                      <td className="py-2 text-right text-[var(--color-success)]">
                        {formatMoney(o.receivable)}
                      </td>
                      <td className="py-2 text-right text-[var(--color-danger)]">
                        {formatMoney(o.payable)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatMoney(o.position)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
