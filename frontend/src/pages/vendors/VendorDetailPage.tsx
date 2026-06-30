import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useVendorDetail } from '@/hooks/useVendors';
import { useRegisterExpensePayment } from '@/hooks/useFinance';
import type { ExpenseRecord } from '@/types/domain';

type EstadoPago = 'paid' | 'overdue' | 'pending' | 'cancelled';

const ESTADO_LABEL: Record<EstadoPago, string> = {
  paid: 'Pagado',
  overdue: 'Vencido',
  pending: 'Pendiente',
  cancelled: 'Anulado',
};

const ESTADO_CLASS: Record<EstadoPago, string> = {
  paid: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  overdue: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  pending: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  cancelled: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

// Estado de pago derivado, alineado con expenses.service.ts (paymentState).
function estadoPago(exp: ExpenseRecord): EstadoPago {
  if (exp.status === 'CANCELLED') return 'cancelled';
  if (exp.paidDate) return 'paid';
  if (exp.dueDate && new Date(exp.dueDate) < new Date()) return 'overdue';
  return 'pending';
}

export function VendorDetailPage() {
  const { id } = useParams();
  const { data: vendor, isLoading, isError, error } = useVendorDetail(id);
  const registrar = useRegisterExpensePayment();

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/proveedores"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a proveedores
        </Link>
      </div>

      {isLoading && <Spinner label="Cargando proveedor…" />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {vendor && (
        <>
          <PageHeader
            title={vendor.name}
            description={`${vendor.rut} · ${vendor.organization?.name ?? '—'}`}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total gastado"
              value={formatMoney(vendor.stats.totalSpent)}
            />
            <MetricCard title="Pagado" value={formatMoney(vendor.stats.paidAmount)} />
            <MetricCard
              title="Pendiente"
              value={formatMoney(vendor.stats.pendingAmount)}
              tone={vendor.stats.pendingAmount > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              title="Documentos"
              value={String(vendor.stats.documentCount)}
            />
          </div>

          {vendor.expenses.length === 0 ? (
            <EmptyState title="Sin documentos">
              Este proveedor aún no tiene gastos asociados.
            </EmptyState>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
                <FileText className="h-5 w-5 text-[var(--color-primary)]" />
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                  Documentos ({vendor.expenses.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Folio</th>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 text-right font-medium">Monto</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {vendor.expenses.map((exp) => {
                      const estado = estadoPago(exp);
                      return (
                        <tr
                          key={exp.id}
                          className="hover:bg-[var(--color-muted)]/40"
                        >
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {exp.sourceFolio ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {formatDate(exp.sourceIssueDate ?? exp.expenseDate)}
                          </td>
                          <td className="px-4 py-3">{exp.description}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatMoney(exp.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={ESTADO_CLASS[estado]}>
                              {ESTADO_LABEL[estado]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {exp.status === 'CANCELLED' ? (
                              <span className="text-[var(--color-muted-foreground)]">
                                —
                              </span>
                            ) : exp.paidDate ? (
                              <Button
                                variant="outline"
                                onClick={() =>
                                  registrar.mutate({ id: exp.id, paidDate: null })
                                }
                                disabled={registrar.isPending}
                              >
                                Revertir
                              </Button>
                            ) : (
                              <Button
                                onClick={() =>
                                  registrar.mutate({
                                    id: exp.id,
                                    // Fecha LOCAL (YYYY-MM-DD); no toISOString() para
                                    // no registrar el día anterior por desfase UTC.
                                    paidDate: new Date().toLocaleDateString('en-CA'),
                                  })
                                }
                                disabled={registrar.isPending}
                              >
                                Marcar pagada
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {registrar.isError && (
            <ErrorState message={getErrorMessage(registrar.error)} />
          )}
        </>
      )}
    </div>
  );
}
