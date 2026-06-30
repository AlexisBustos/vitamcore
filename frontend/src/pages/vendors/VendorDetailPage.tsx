import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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

const ESTADO_OPTIONS: { value: EstadoPago; label: string }[] = [
  { value: 'paid', label: 'Pagado' },
  { value: 'overdue', label: 'Vencido' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'cancelled', label: 'Anulado' },
];

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

  const [folio, setFolio] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPago | ''>('');

  // Filtrado en cliente sobre los gastos ya cargados, reutilizando estadoPago()
  // para que el badge y el filtro siempre coincidan.
  const documentos = useMemo(() => {
    const q = folio.trim().toLowerCase();
    return (vendor?.expenses ?? []).filter((exp) => {
      if (q && !(exp.sourceFolio ?? '').toLowerCase().includes(q)) return false;
      if (estadoFiltro && estadoPago(exp) !== estadoFiltro) return false;
      return true;
    });
  }, [vendor?.expenses, folio, estadoFiltro]);

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
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[var(--color-primary)]" />
                  <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                    Documentos ({documentos.length})
                  </h2>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                    <Input
                      value={folio}
                      onChange={(e) => setFolio(e.target.value)}
                      placeholder="Buscar por folio…"
                      className="w-48 pl-9"
                    />
                  </div>
                  <Select
                    value={estadoFiltro}
                    onChange={(e) =>
                      setEstadoFiltro(e.target.value as EstadoPago | '')
                    }
                    options={ESTADO_OPTIONS}
                    placeholder="Todos los estados"
                    className="w-44"
                  />
                </div>
              </div>
              {documentos.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState title="Sin resultados">
                    Ningún documento coincide con los filtros aplicados.
                  </EmptyState>
                </div>
              ) : (
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
                    {documentos.map((exp) => {
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
              )}
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
