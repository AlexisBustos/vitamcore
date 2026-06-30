import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useIncome, useIncomeMonths, useRegisterPayment } from '@/hooks/useFinance';
import { MonthFilter } from '@/components/MonthFilter';
import { ReconcileModal } from './ReconcileModal';

type Estado = 'receivable' | 'overdue' | 'paid' | 'cancelled';

const ESTADOS: { value: Estado; label: string }[] = [
  { value: 'receivable', label: 'Por cobrar' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'cancelled', label: 'Anuladas' },
];

export function ReceivablesTab({
  organizationId,
}: {
  organizationId?: string;
}) {
  const [estado, setEstado] = useState<Estado>('receivable');
  const [month, setMonth] = useState<string | undefined>();
  const [reconciling, setReconciling] = useState<typeof rows[number] | null>(null);

  const { data: rows = [], isLoading, isError, error } = useIncome({
    organizationId,
    paymentState: estado,
    month,
  });
  const registrar = useRegisterPayment();
  const { data: months = [] } = useIncomeMonths(organizationId);

  const total = rows.reduce((s, r) => s + (r.netAmount ?? r.amount), 0);

  if (!organizationId) {
    return (
      <EmptyState title="Selecciona una empresa">
        Elige una empresa arriba para ver sus cuentas por cobrar.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros de estado + mes */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              onClick={() => setEstado(e.value)}
              className={
                estado === e.value
                  ? 'rounded-md px-4 py-1.5 text-sm font-medium bg-[var(--color-primary)] text-white transition-colors'
                  : 'rounded-md px-4 py-1.5 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors'
              }
            >
              {e.label}
            </button>
          ))}
        </div>
        <div className="w-48">
          <MonthFilter months={months} value={month} onChange={setMonth} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Encabezado con total */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">
              {ESTADOS.find((e) => e.value === estado)?.label ?? estado}
            </h2>
          </div>
          {!isLoading && !isError && rows.length > 0 && (
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              Total:{' '}
              <span className="text-[var(--color-primary)]">
                {formatMoney(total)}
              </span>
            </span>
          )}
        </div>

        {isLoading && <Spinner label="Cargando facturas…" />}
        {isError && (
          <div className="p-5">
            <ErrorState message={getErrorMessage(error)} />
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState title="Sin facturas en este estado" />
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                  <th className="px-4 py-3 text-right font-medium">Neto</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {r.clientName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.sourceFolio ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.incomeDate ? formatDate(r.incomeDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.dueDate ? formatDate(r.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(r.netAmount ?? r.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {r.paidDate ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            registrar.mutate({ id: r.id, paidDate: null })
                          }
                          disabled={registrar.isPending}
                        >
                          Revertir
                        </Button>
                      ) : (
                        <Button onClick={() => setReconciling(r)} disabled={registrar.isPending}>
                          Conciliar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {registrar.isError && (
        <ErrorState message={getErrorMessage(registrar.error)} />
      )}

      <ReconcileModal
        open={!!reconciling}
        onClose={() => setReconciling(null)}
        recordType="income"
        record={
          reconciling
            ? {
                id: reconciling.id,
                name: reconciling.clientName ?? '—',
                folio: reconciling.sourceFolio ?? null,
                amount: reconciling.netAmount ?? reconciling.amount,
              }
            : null
        }
        pending={registrar.isPending}
        onReconcile={(bankTransactionId) => {
          if (reconciling) registrar.mutate({ id: reconciling.id, bankTransactionId });
          setReconciling(null);
        }}
        onPayManual={() => {
          if (reconciling)
            registrar.mutate({
              id: reconciling.id,
              paidDate: new Date().toLocaleDateString('en-CA'),
            });
          setReconciling(null);
        }}
      />
    </div>
  );
}
