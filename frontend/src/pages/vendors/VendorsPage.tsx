// Wrapper sobre PartyListPage para el listado de proveedores (cuentas por
// pagar). Conserva el nombre exportado que monta App.tsx en /proveedores.
import { Truck } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric';
import { formatDate, formatMoney } from '@/lib/domain';
import { useVendors, type VendorFilters } from '@/hooks/useVendors';
import {
  PartyListPage,
  type PartyListConfig,
} from '@/components/parties/PartyListPage';
import type { Vendor } from '@/types/domain';

export function VendorsPage() {
  const config: PartyListConfig<Vendor, VendorFilters> = {
    listHook: useVendors,
    title: 'Proveedores',
    description:
      'Cartera consolidada por empresa, generada al importar compras.',
    routeTo: (v) => `/proveedores/${v.id}`,
    metrics: (data) => {
      const totalSpent = data.reduce((sum, v) => sum + v.stats.totalSpent, 0);
      const totalPending = data.reduce(
        (sum, v) => sum + v.stats.pendingAmount,
        0,
      );
      return (
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
      );
    },
    columns: [
      {
        header: 'Proveedor',
        render: (v) => (
          <td className="px-4 py-3">
            <p className="font-medium text-[var(--color-foreground)]">
              {v.name}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {v.rut}
            </p>
          </td>
        ),
      },
      {
        header: 'Empresa',
        render: (v) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {v.organization?.name ?? '—'}
          </td>
        ),
      },
      {
        header: 'Documentos',
        align: 'right',
        render: (v) => (
          <td className="px-4 py-3 text-right">{v.stats.documentCount}</td>
        ),
      },
      {
        header: 'Total gastado',
        align: 'right',
        render: (v) => (
          <td className="px-4 py-3 text-right font-medium">
            {formatMoney(v.stats.totalSpent)}
          </td>
        ),
      },
      {
        header: 'Pendiente',
        align: 'right',
        render: (v) => (
          <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
            {v.stats.pendingAmount ? formatMoney(v.stats.pendingAmount) : '—'}
          </td>
        ),
      },
      {
        header: 'Último documento',
        render: (v) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {formatDate(v.stats.lastDocumentDate)}
          </td>
        ),
      },
    ],
    empty: {
      title: 'Sin proveedores',
      body: (
        <>
          Aún no hay proveedores. Se crean automáticamente al importar
          reportes de compras en Finanzas → Importaciones.
        </>
      ),
    },
  };

  return <PartyListPage config={config} />;
}
