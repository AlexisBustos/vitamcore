// Página genérica de detalle de contraparte (cliente / proveedor). Unifica los
// gemelos ClientDetailPage/VendorDetailPage: la estructura común (back-link,
// métricas, tabla de documentos filtrable) se parametriza vía `PartyDetailConfig`.
// La divergencia NC-aware del cliente se expresa con predicados INDEPENDIENTES del
// config: `isCreditNote` oculta SOLO la celda Estado, `isCancelled` oculta SOLO la
// celda Acción. En proveedor no se pasa `isCreditNote`, así que el badge de estado
// (incluido "Anulado") siempre se muestra.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowLeft, FileText, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { PAYMENT_STATE_CLASS, type PaymentState } from '@/lib/paymentState';
import type { useRegisterPayment } from '@/hooks/useFinance';

// Definición declarativa de una columna de DATOS. `render` devuelve el `<td>`
// completo (verbatim del gemelo, incluidas sus clases); `align` alinea el `<th>`.
export interface DocColumn<R> {
  header: string;
  align?: 'right';
  render: (row: R) => ReactNode;
}

export interface PartyDetailConfig<E, R> {
  detailHook: (id?: string) => UseQueryResult<E>;
  register: ReturnType<typeof useRegisterPayment>; // invocado en el wrapper
  backLink: { to: string; label: string };
  header: (entity: E) => { title: string; description: string };
  metrics: (entity: E) => ReactNode; // 4 <MetricCard/>
  records: (entity: E) => R[];
  emptyDocs: string; // texto EmptyState sin documentos
  deriveState: (row: R) => PaymentState;
  stateLabel: Record<PaymentState, string>;
  stateOptions: { value: PaymentState; label: string }[];
  isCreditNote?: (row: R) => boolean; // solo cliente; oculta la celda ESTADO
  filterHidesCreditNotesOnState?: boolean; // true en cliente: al filtrar por estado, ocultar NC
  matchFolio: (row: R) => string | null; // sourceFolio
  columns: DocColumn<R>[]; // celdas de DATOS (no Estado/Acción)
  isCancelled: (row: R) => boolean; // oculta solo la ACCIÓN
  paidDate: (row: R) => string | null;
  rowId: (row: R) => string;
  spinnerLabel: string; // "Cargando cliente…" | "Cargando proveedor…"
}

export function PartyDetailPage<E, R>({
  config,
}: {
  config: PartyDetailConfig<E, R>;
}) {
  const { id } = useParams();
  const { data: entity, isLoading, isError, error } = config.detailHook(id);
  const registrar = config.register;

  const [folio, setFolio] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<PaymentState | ''>('');

  const records = entity ? config.records(entity) : [];

  // Filtrado en cliente sobre los documentos ya cargados. El filtro de estado
  // solo aplica a documentos con estado; las notas de crédito no tienen estado de
  // cobro, así que se ocultan cuando hay un estado seleccionado (solo cliente).
  const documentos = useMemo(() => {
    const q = folio.trim().toLowerCase();
    return records.filter((row) => {
      if (q && !(config.matchFolio(row) ?? '').toLowerCase().includes(q))
        return false;
      if (estadoFiltro) {
        if (config.filterHidesCreditNotesOnState && config.isCreditNote?.(row))
          return false;
        if (config.deriveState(row) !== estadoFiltro) return false;
      }
      return true;
    });
  }, [records, folio, estadoFiltro, config]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={config.backLink.to}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> {config.backLink.label}
        </Link>
      </div>

      {isLoading && <Spinner label={config.spinnerLabel} />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {entity && (
        <>
          <PageHeader
            title={config.header(entity).title}
            description={config.header(entity).description}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {config.metrics(entity)}
          </div>

          {records.length === 0 ? (
            <EmptyState title="Sin documentos">{config.emptyDocs}</EmptyState>
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
                      setEstadoFiltro(e.target.value as PaymentState | '')
                    }
                    options={config.stateOptions}
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
                      {config.columns.map((col) => (
                        <th
                          key={col.header}
                          className={`px-4 py-3 ${col.align === 'right' ? 'text-right font-medium' : 'font-medium'}`}
                        >
                          {col.header}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {documentos.map((row) => (
                      <tr
                        key={config.rowId(row)}
                        className="hover:bg-[var(--color-muted)]/40"
                      >
                        {config.columns.map((col) => (
                          <Fragment key={col.header}>{col.render(row)}</Fragment>
                        ))}
                        <td className="px-4 py-3">
                          {config.isCreditNote?.(row) ? (
                            <span className="text-[var(--color-muted-foreground)]">
                              —
                            </span>
                          ) : (
                            <Badge
                              className={PAYMENT_STATE_CLASS[config.deriveState(row)]}
                            >
                              {config.stateLabel[config.deriveState(row)]}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {config.isCancelled(row) ? (
                            <span className="text-[var(--color-muted-foreground)]">
                              —
                            </span>
                          ) : config.paidDate(row) ? (
                            <Button
                              variant="outline"
                              onClick={() =>
                                registrar.mutate({
                                  id: config.rowId(row),
                                  paidDate: null,
                                })
                              }
                              disabled={registrar.isPending}
                            >
                              Revertir
                            </Button>
                          ) : (
                            <Button
                              onClick={() =>
                                registrar.mutate({
                                  id: config.rowId(row),
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
                    ))}
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
