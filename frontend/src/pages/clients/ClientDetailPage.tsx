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
import { useClientDetail } from '@/hooks/useClients';
import { useRegisterPayment } from '@/hooks/useFinance';
import type { IncomeRecord } from '@/types/domain';

type EstadoCobro = 'paid' | 'overdue' | 'receivable' | 'cancelled';

const ESTADO_LABEL: Record<EstadoCobro, string> = {
  paid: 'Pagada',
  overdue: 'Vencida',
  receivable: 'Por cobrar',
  cancelled: 'Anulada',
};

const ESTADO_CLASS: Record<EstadoCobro, string> = {
  paid: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  overdue: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  receivable: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  cancelled: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

const ESTADO_OPTIONS: { value: EstadoCobro; label: string }[] = [
  { value: 'paid', label: 'Pagada' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'receivable', label: 'Por cobrar' },
  { value: 'cancelled', label: 'Anulada' },
];

// Estado de cobro derivado, alineado con income.service.ts (paymentState):
// anulada = netAmount 0; pagada = tiene paidDate; vencida = dueDate pasado sin pago.
function estadoCobro(inc: IncomeRecord): EstadoCobro {
  if (inc.netAmount === 0) return 'cancelled';
  if (inc.paidDate) return 'paid';
  if (inc.dueDate && new Date(inc.dueDate) < new Date()) return 'overdue';
  return 'receivable';
}

export function ClientDetailPage() {
  const { id } = useParams();
  const { data: client, isLoading, isError, error } = useClientDetail(id);
  const registrar = useRegisterPayment();

  const [folio, setFolio] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoCobro | ''>('');

  // Filtrado en cliente sobre los documentos ya cargados. El filtro de estado
  // solo aplica a facturas; las notas de crédito no tienen estado de cobro, así
  // que se ocultan cuando hay un estado seleccionado.
  const documentos = useMemo(() => {
    const q = folio.trim().toLowerCase();
    return (client?.incomes ?? []).filter((inc) => {
      if (q && !(inc.sourceFolio ?? '').toLowerCase().includes(q)) return false;
      if (estadoFiltro) {
        if (inc.documentKind === 'CREDIT_NOTE') return false;
        if (estadoCobro(inc) !== estadoFiltro) return false;
      }
      return true;
    });
  }, [client?.incomes, folio, estadoFiltro]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/clientes"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a clientes
        </Link>
      </div>

      {isLoading && <Spinner label="Cargando cliente…" />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {client && (
        <>
          <PageHeader
            title={client.name}
            description={`${client.rut} · ${client.organization?.name ?? '—'}`}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Venta neta"
              value={formatMoney(client.stats.netSales)}
            />
            <MetricCard
              title="Bruto facturado"
              value={formatMoney(client.stats.grossInvoiced)}
            />
            <MetricCard
              title="Notas de crédito"
              value={formatMoney(client.stats.totalCreditNotes)}
              tone={client.stats.totalCreditNotes > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              title="Facturas"
              value={String(client.stats.invoiceCount)}
            />
          </div>

          {client.incomes.length === 0 ? (
            <EmptyState title="Sin documentos">
              Este cliente aún no tiene facturas ni notas de crédito asociadas.
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
                      setEstadoFiltro(e.target.value as EstadoCobro | '')
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
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 text-right font-medium">Bruto</th>
                      <th className="px-4 py-3 text-right font-medium">Neto</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {documentos.map((inc) => {
                      const esNC = inc.documentKind === 'CREDIT_NOTE';
                      const estado = esNC ? null : estadoCobro(inc);
                      return (
                        <tr
                          key={inc.id}
                          className="hover:bg-[var(--color-muted)]/40"
                        >
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {inc.sourceFolio ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {formatDate(inc.sourceIssueDate ?? inc.incomeDate)}
                          </td>
                          <td className="px-4 py-3">{esNC ? 'NC' : 'Factura'}</td>
                          <td className="px-4 py-3">{inc.description}</td>
                          <td className="px-4 py-3 text-right">
                            {formatMoney(inc.amount)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatMoney(inc.netAmount ?? inc.amount)}
                          </td>
                          <td className="px-4 py-3">
                            {esNC ? (
                              <span className="text-[var(--color-muted-foreground)]">
                                —
                              </span>
                            ) : (
                              <Badge className={ESTADO_CLASS[estado!]}>
                                {ESTADO_LABEL[estado!]}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {esNC ? (
                              <span className="text-[var(--color-muted-foreground)]">
                                —
                              </span>
                            ) : inc.paidDate ? (
                              <Button
                                variant="outline"
                                onClick={() =>
                                  registrar.mutate({ id: inc.id, paidDate: null })
                                }
                                disabled={registrar.isPending}
                              >
                                Revertir
                              </Button>
                            ) : (
                              <Button
                                onClick={() =>
                                  registrar.mutate({
                                    id: inc.id,
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
