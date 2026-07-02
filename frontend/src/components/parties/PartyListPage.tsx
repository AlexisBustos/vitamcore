// Página genérica de listado de contraparte (cliente / proveedor). Unifica los
// gemelos ClientsPage/VendorsPage: cabecera, métricas condicionadas a datos,
// filtros (empresa + búsqueda) y tabla de filas clicables que navegan al detalle.
// Las métricas y columnas son declarativas (`config.metrics`/`config.columns`)
// para que cada wrapper reproduzca su markup exacto (4 vs 3 métricas, 10 vs 6
// columnas, celdas con o sin clase de color condicional).
import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';

// ClientFilters y VendorFilters son estructuralmente idénticos: se usa un tipo
// interno común para el estado de filtros del genérico.
type PartyFilters = { organizationId?: string; search?: string };

export interface Column<T> {
  header: string;
  align?: 'right';
  render: (row: T) => ReactNode;
}

export interface PartyListConfig<T extends { id: string }, F> {
  listHook: (filters: F) => UseQueryResult<T[]>;
  icon: LucideIcon;
  title: string;
  description: string;
  routeTo: (row: T) => string; // `/clientes/${id}` | `/proveedores/${id}`
  metrics: (rows: T[]) => ReactNode; // grid de MetricCard (incluye su propio grid className)
  columns: Column<T>[];
  empty: { title: string; body: ReactNode };
  searchPlaceholder?: string; // "Buscar por razón social o RUT" (igual en ambos)
}

export function PartyListPage<T extends { id: string }, F extends PartyFilters>({
  config,
}: {
  config: PartyListConfig<T, F>;
}) {
  const [filters, setFilters] = useState<PartyFilters>({});
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = config.listHook(filters as F);

  function set(key: keyof PartyFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <div className="space-y-6">
      <PageHeader title={config.title} description={config.description} />

      {data && data.length > 0 && config.metrics(data)}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Input
            placeholder={config.searchPlaceholder ?? 'Buscar por razón social o RUT'}
            value={filters.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && data.length === 0 && (
        <EmptyState title={config.empty.title}>{config.empty.body}</EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  {config.columns.map((col) => (
                    <th
                      key={col.header}
                      className={
                        col.align === 'right'
                          ? 'px-4 py-3 text-right font-medium'
                          : 'px-4 py-3 font-medium'
                      }
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(config.routeTo(row))}
                    onKeyDown={(e) =>
                      (e.key === 'Enter' || e.key === ' ') &&
                      navigate(config.routeTo(row))
                    }
                    tabIndex={0}
                    className="cursor-pointer hover:bg-[var(--color-muted)]/40"
                  >
                    {config.columns.map((col) => (
                      <Fragment key={col.header}>{col.render(row)}</Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
