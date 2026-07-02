// Wrapper sobre PartyListPage para el listado de clientes (cuentas por
// cobrar). Conserva el nombre exportado que monta App.tsx en /clientes.
import { Users } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric';
import { formatDate, formatMoney } from '@/lib/domain';
import { useClients, type ClientFilters } from '@/hooks/useClients';
import {
  PartyListPage,
  type PartyListConfig,
} from '@/components/parties/PartyListPage';
import type { Client } from '@/types/domain';

export function ClientsPage() {
  const config: PartyListConfig<Client, ClientFilters> = {
    listHook: useClients,
    icon: Users,
    title: 'Clientes',
    description:
      'Cartera consolidada por empresa, generada al importar ventas.',
    routeTo: (c) => `/clientes/${c.id}`,
    metrics: (data) => {
      const totalNet = data.reduce((sum, c) => sum + c.stats.netSales, 0);
      const totalCreditNotes = data.reduce(
        (sum, c) => sum + c.stats.totalCreditNotes,
        0,
      );
      const totalPending = data.reduce(
        (sum, c) => sum + c.stats.pendingAmount,
        0,
      );
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Clientes"
            value={String(data.length)}
            icon={Users}
          />
          <MetricCard title="Venta neta total" value={formatMoney(totalNet)} />
          <MetricCard
            title="Por cobrar"
            value={formatMoney(totalPending)}
            tone={totalPending > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            title="Notas de crédito"
            value={formatMoney(totalCreditNotes)}
            tone={totalCreditNotes > 0 ? 'warning' : 'default'}
          />
        </div>
      );
    },
    columns: [
      {
        header: 'Cliente',
        render: (c) => (
          <td className="px-4 py-3">
            <p className="font-medium text-[var(--color-foreground)]">
              {c.name}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {c.rut}
            </p>
          </td>
        ),
      },
      {
        header: 'Empresa',
        render: (c) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {c.organization?.name ?? '—'}
          </td>
        ),
      },
      {
        header: 'Facturas',
        align: 'right',
        render: (c) => (
          <td className="px-4 py-3 text-right">{c.stats.invoiceCount}</td>
        ),
      },
      {
        header: 'NC',
        align: 'right',
        render: (c) => (
          <td className="px-4 py-3 text-right">{c.stats.creditNoteCount}</td>
        ),
      },
      {
        header: 'Bruto facturado',
        align: 'right',
        render: (c) => (
          <td className="px-4 py-3 text-right">
            {formatMoney(c.stats.grossInvoiced)}
          </td>
        ),
      },
      {
        header: 'Notas de crédito',
        align: 'right',
        render: (c) => (
          <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
            {c.stats.totalCreditNotes
              ? formatMoney(-c.stats.totalCreditNotes)
              : '—'}
          </td>
        ),
      },
      {
        header: 'Venta neta',
        align: 'right',
        render: (c) => (
          <td className="px-4 py-3 text-right font-medium">
            {formatMoney(c.stats.netSales)}
          </td>
        ),
      },
      {
        header: 'Cobrado',
        align: 'right',
        render: (c) => (
          <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
            {c.stats.collectedAmount
              ? formatMoney(c.stats.collectedAmount)
              : '—'}
          </td>
        ),
      },
      {
        header: 'Por cobrar',
        align: 'right',
        render: (c) => (
          <td
            className={`px-4 py-3 text-right ${
              c.stats.pendingAmount > 0
                ? 'font-medium text-[var(--color-warning)]'
                : 'text-[var(--color-muted-foreground)]'
            }`}
          >
            {c.stats.pendingAmount ? formatMoney(c.stats.pendingAmount) : '—'}
          </td>
        ),
      },
      {
        header: 'Último documento',
        render: (c) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {formatDate(c.stats.lastDocumentDate)}
          </td>
        ),
      },
    ],
    empty: {
      title: 'Sin clientes',
      body: (
        <>
          Aún no hay clientes. Se crean automáticamente al importar reportes
          de ventas en Finanzas → Importaciones.
        </>
      ),
    },
  };

  return <PartyListPage config={config} />;
}
