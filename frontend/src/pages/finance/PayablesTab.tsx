import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useExpenses,
  useExpenseMonths,
  useRegisterExpensePayment,
} from '@/hooks/useFinance';
import { MonthFilter } from '@/components/MonthFilter';

type Estado = 'payable' | 'overdue' | 'paid' | 'cancelled';

const ESTADOS: { value: Estado; label: string }[] = [
  { value: 'payable', label: 'Por pagar' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'cancelled', label: 'Anuladas' },
];

export function PayablesTab({ organizationId }: { organizationId?: string }) {
  const [estado, setEstado] = useState<Estado>('payable');
  const [month, setMonth] = useState<string | undefined>();

  const { data: rows = [], isLoading, isError, error } = useExpenses({
    organizationId,
    paymentState: estado,
    month,
  });
  const { data: months = [] } = useExpenseMonths(organizationId);
  const registrar = useRegisterExpensePayment();

  const total = rows.reduce((s, r) => s + r.amount, 0);

  if (!organizationId) {
    return (
      <EmptyState title="Selecciona una empresa">
        Elige una empresa arriba para ver sus cuentas por pagar.
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
            <CreditCard className="h-5 w-5 text-[var(--color-primary)]" />
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

        {isLoading && <Spinner label="Cargando gastos…" />}
        {isError && (
          <div className="p-5">
            <ErrorState message={getErrorMessage(error)} />
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState title="Sin gastos en este estado" />
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {r.vendorName ? (
                        r.vendorId ? (
                          <Link
                            to={`/proveedores/${r.vendorId}`}
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {r.vendorName}
                          </Link>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">
                            {r.vendorName}
                          </span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.sourceFolio ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.expenseDate ? formatDate(r.expenseDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.dueDate ? formatDate(r.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(r.amount)}
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
                        <Button
                          onClick={() =>
                            registrar.mutate({
                              id: r.id,
                              // Fecha LOCAL ('en-CA' → YYYY-MM-DD), no toISOString().
                              paidDate: new Date().toLocaleDateString('en-CA'),
                            })
                          }
                          disabled={registrar.isPending}
                        >
                          Marcar pagado
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
    </div>
  );
}
