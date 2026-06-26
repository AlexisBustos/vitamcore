import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useVendors, type VendorFilters } from '@/hooks/useVendors';

export function VendorsPage() {
  const [filters, setFilters] = useState<VendorFilters>({});
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useVendors(filters);

  function set(key: keyof VendorFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  const totalSpent = (data ?? []).reduce((sum, v) => sum + v.stats.totalSpent, 0);
  const totalPending = (data ?? []).reduce(
    (sum, v) => sum + v.stats.pendingAmount,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description="Cartera consolidada por empresa, generada al importar compras."
      />

      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            title="Proveedores"
            value={String(data.length)}
            icon={Truck}
          />
          <MetricCard title="Total gastado" value={formatMoney(totalSpent)} />
          <MetricCard
            title="Pendiente"
            value={formatMoney(totalPending)}
            tone={totalPending > 0 ? 'warning' : 'default'}
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
        <EmptyState title="Sin proveedores">
          Aún no hay proveedores. Se crean automáticamente al importar reportes de
          compras en Finanzas → Importaciones.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 text-right font-medium">Documentos</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Total gastado
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-3 font-medium">Último documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => navigate(`/proveedores/${v.id}`)}
                    onKeyDown={(e) =>
                      (e.key === 'Enter' || e.key === ' ') &&
                      navigate(`/proveedores/${v.id}`)
                    }
                    tabIndex={0}
                    className="cursor-pointer hover:bg-[var(--color-muted)]/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {v.name}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {v.rut}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {v.organization?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.stats.documentCount}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(v.stats.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
                      {v.stats.pendingAmount
                        ? formatMoney(v.stats.pendingAmount)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatDate(v.stats.lastDocumentDate)}
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
