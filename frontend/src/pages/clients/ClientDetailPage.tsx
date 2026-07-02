// Wrapper NC-aware sobre PartyDetailPage para el detalle de cliente (cuentas por
// cobrar). Conserva el nombre exportado que monta App.tsx en /clientes/:id.
import { MetricCard } from '@/components/ui/metric';
import { formatDate, formatMoney } from '@/lib/domain';
import { useClientDetail } from '@/hooks/useClients';
import { useRegisterPayment } from '@/hooks/useFinance';
import {
  deriveReceivableState,
  RECEIVABLE_LABEL,
  receivableStateOptions,
} from '@/lib/paymentState';
import {
  PartyDetailPage,
  type PartyDetailConfig,
} from '@/components/parties/PartyDetailPage';
import type { ClientDetail, IncomeRecord } from '@/types/domain';

export function ClientDetailPage() {
  const register = useRegisterPayment();

  const config: PartyDetailConfig<ClientDetail, IncomeRecord> = {
    detailHook: useClientDetail,
    register,
    backLink: { to: '/clientes', label: 'Volver a clientes' },
    header: (client) => ({
      title: client.name,
      description: `${client.rut} · ${client.organization?.name ?? '—'}`,
    }),
    metrics: (client) => (
      <>
        <MetricCard title="Venta neta" value={formatMoney(client.stats.netSales)} />
        <MetricCard
          title="Bruto facturado"
          value={formatMoney(client.stats.grossInvoiced)}
        />
        <MetricCard
          title="Notas de crédito"
          value={formatMoney(client.stats.totalCreditNotes)}
          tone={client.stats.totalCreditNotes > 0 ? 'warning' : 'default'}
        />
        <MetricCard title="Facturas" value={String(client.stats.invoiceCount)} />
      </>
    ),
    records: (client) => client.incomes,
    emptyDocs:
      'Este cliente aún no tiene facturas ni notas de crédito asociadas.',
    deriveState: deriveReceivableState,
    stateLabel: RECEIVABLE_LABEL,
    stateOptions: receivableStateOptions,
    isCreditNote: (inc) => inc.documentKind === 'CREDIT_NOTE',
    filterHidesCreditNotesOnState: true,
    matchFolio: (inc) => inc.sourceFolio,
    columns: [
      {
        header: 'Folio',
        render: (inc) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {inc.sourceFolio ?? '—'}
          </td>
        ),
      },
      {
        header: 'Fecha',
        render: (inc) => (
          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
            {formatDate(inc.sourceIssueDate ?? inc.incomeDate)}
          </td>
        ),
      },
      {
        header: 'Tipo',
        render: (inc) => (
          <td className="px-4 py-3">
            {inc.documentKind === 'CREDIT_NOTE' ? 'NC' : 'Factura'}
          </td>
        ),
      },
      {
        header: 'Descripción',
        render: (inc) => <td className="px-4 py-3">{inc.description}</td>,
      },
      {
        header: 'Bruto',
        align: 'right',
        render: (inc) => (
          <td className="px-4 py-3 text-right">{formatMoney(inc.amount)}</td>
        ),
      },
      {
        header: 'Neto',
        align: 'right',
        render: (inc) => (
          <td className="px-4 py-3 text-right font-medium">
            {formatMoney(inc.netAmount ?? inc.amount)}
          </td>
        ),
      },
    ],
    isCancelled: (inc) => inc.documentKind === 'CREDIT_NOTE',
    paidDate: (inc) => inc.paidDate,
    rowId: (inc) => inc.id,
    spinnerLabel: 'Cargando cliente…',
  };

  return <PartyDetailPage config={config} />;
}
