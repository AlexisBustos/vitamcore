import { Wallet, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Button } from '@/components/ui/button';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useConsolidated } from '@/hooks/useFinance';

// 'YYYY-MM' → 'mayo' para rotular el cuadre; undefined = todos los meses.
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
function cuadreLabel(month?: string): string {
  if (!month) return 'Cuadre — todos los meses';
  const [y, m] = month.split('-').map(Number);
  const nombre = MESES[m - 1];
  return nombre ? `Cuadre de ${nombre} ${y}` : `Cuadre ${month}`;
}

export function ConsolidatedPosition({
  organizationId,
  month,
  onReviewUnlinked,
  onAutoReconcile,
}: {
  organizationId?: string;
  month?: string;
  onReviewUnlinked: () => void;
  onAutoReconcile: () => void;
}) {
  const { data, isLoading, isError, error } = useConsolidated({ organizationId, month });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

  const rec = data.reconciliation;

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

      {/* Cuadre del mes (banco ↔ facturas/gastos) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{cuadreLabel(month)}</CardTitle>
          <Button variant="outline" onClick={onAutoReconcile}>
            Auto-conciliar exactos
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="py-2 font-medium" />
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">Conciliado</th>
                  <th className="py-2 text-right font-medium">Suelto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                <tr>
                  <td className="py-2 font-medium text-[var(--color-foreground)]">
                    Abonos (cobros)
                  </td>
                  <td className="py-2 text-right">{formatMoney(rec.credits.total)}</td>
                  <td className="py-2 text-right text-[var(--color-success)]">
                    {formatMoney(rec.credits.conciliado)}
                  </td>
                  <td className="py-2 text-right text-[var(--color-muted-foreground)]">
                    {formatMoney(rec.credits.suelto)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-[var(--color-foreground)]">
                    Cargos (pagos)
                  </td>
                  <td className="py-2 text-right">{formatMoney(rec.charges.total)}</td>
                  <td className="py-2 text-right text-[var(--color-success)]">
                    {formatMoney(rec.charges.conciliado)}
                  </td>
                  <td className="py-2 text-right text-[var(--color-muted-foreground)]">
                    {formatMoney(rec.charges.suelto)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {rec.unlinkedCount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <span>⚠ {rec.unlinkedCount} movimiento(s) sin enlazar</span>
              <button
                type="button"
                onClick={onReviewUnlinked}
                className="font-medium text-[var(--color-primary)] hover:underline"
              >
                revisar
              </button>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <tr key={o.organizationId}>
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
