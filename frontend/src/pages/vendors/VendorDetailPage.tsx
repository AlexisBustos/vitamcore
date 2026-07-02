// Wrapper sobre PartyDetailPage para el detalle de proveedor (cuentas por pagar).
// A diferencia del cliente NO es NC-aware: no pasa `isCreditNote`, así que el badge
// de estado (incluido "Anulado" para status==='CANCELLED') siempre se muestra.
// Conserva el nombre exportado que monta App.tsx en /proveedores/:id.
import { MetricCard } from '@/components/ui/metric';
import { formatDate, formatMoney } from '@/lib/domain';
import { useVendorDetail } from '@/hooks/useVendors';
import { useRegisterExpensePayment } from '@/hooks/useFinance';
import {
  derivePayableState,
  PAYABLE_LABEL,
  payableStateOptions,
} from '@/lib/paymentState';
import {
  PartyDetailPage,
  type PartyDetailConfig,
} from '@/components/parties/PartyDetailPage';
import type { ExpenseRecord, VendorDetail } from '@/types/domain';

export function VendorDetailPage() {
  const register = useRegisterExpensePayment();

  const config: PartyDetailConfig<VendorDetail, ExpenseRecord> = {
    detailHook: useVendorDetail,
    register,
    backLink: { to: '/proveedores', label: 'Volver a proveedores' },
    header: (vendor) => ({
      title: vendor.name,
      description: `${vendor.rut} · ${vendor.organization?.name ?? '—'}`,
    }),
    metrics: (vendor) => (
      <>
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
      </>
    ),
    records: (vendor) => vendor.expenses,
    emptyDocs: 'Este proveedor aún no tiene gastos asociados.',
    deriveState: derivePayableState,
    stateLabel: PAYABLE_LABEL,
    stateOptions: payableStateOptions,
    matchFolio: (exp) => exp.sourceFolio,
    columns: [
      {
        header: 'Folio',
        render: (exp) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {exp.sourceFolio ?? '—'}
          </td>
        ),
      },
      {
        header: 'Fecha',
        render: (exp) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {formatDate(exp.sourceIssueDate ?? exp.expenseDate)}
          </td>
        ),
      },
      {
        header: 'Descripción',
        render: (exp) => <td className="px-4 py-3">{exp.description}</td>,
      },
      {
        header: 'Monto',
        align: 'right',
        render: (exp) => (
          <td className="px-4 py-3 text-right font-medium">
            {formatMoney(exp.amount)}
          </td>
        ),
      },
    ],
    isCancelled: (exp) => exp.status === 'CANCELLED',
    paidDate: (exp) => exp.paidDate,
    rowId: (exp) => exp.id,
    spinnerLabel: 'Cargando proveedor…',
  };

  return <PartyDetailPage config={config} />;
}
