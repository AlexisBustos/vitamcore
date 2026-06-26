import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useClients, type ClientFilters } from '@/hooks/useClients';

export function ClientsPage() {
  const [filters, setFilters] = useState<ClientFilters>({});
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useClients(filters);

  function set(key: keyof ClientFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  const totalNet = (data ?? []).reduce((sum, c) => sum + c.stats.netSales, 0);
  const totalCreditNotes = (data ?? []).reduce(
    (sum, c) => sum + c.stats.totalCreditNotes,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cartera consolidada por empresa, generada al importar ventas."
      />

      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            title="Clientes"
            value={String(data.length)}
            icon={Users}
          />
          <MetricCard title="Venta neta total" value={formatMoney(totalNet)} />
          <MetricCard
            title="Notas de crédito"
            value={formatMoney(totalCreditNotes)}
            tone={totalCreditNotes > 0 ? 'warning' : 'default'}
          />
        </div>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Input
            placeholder="Buscar por razón social o RUT"
            value={filters.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && data.length === 0 && (
        <EmptyState title="Sin clientes">
          Aún no hay clientes. Se crean automáticamente al importar reportes de
          ventas en Finanzas → Importaciones.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 text-right font-medium">Facturas</th>
                  <th className="px-4 py-3 text-right font-medium">NC</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Bruto facturado
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Notas de crédito
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Venta neta
                  </th>
                  <th className="px-4 py-3 font-medium">Último documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    onKeyDown={(e) =>
                      (e.key === 'Enter' || e.key === ' ') &&
                      navigate(`/clientes/${c.id}`)
                    }
                    tabIndex={0}
                    className="cursor-pointer hover:bg-[var(--color-muted)]/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {c.name}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {c.rut}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {c.organization?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.stats.invoiceCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.stats.creditNoteCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(c.stats.grossInvoiced)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
                      {c.stats.totalCreditNotes
                        ? formatMoney(-c.stats.totalCreditNotes)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(c.stats.netSales)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatDate(c.stats.lastDocumentDate)}
                    </td>
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
