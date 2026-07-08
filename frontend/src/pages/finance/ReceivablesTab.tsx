// Wrapper delgado de LedgerTab para el libro de cuentas por cobrar (ingresos).
import { Receipt } from 'lucide-react';
import { LedgerTab, type LedgerTabConfig } from '@/components/finance/LedgerTab';
import {
  useIncome,
  useIncomeMonths,
  useRegisterPayment,
  useBulkRegisterPayment,
} from '@/hooks/useFinance';
import type { IncomeRecord } from '@/types/domain';

const config: LedgerTabConfig<IncomeRecord> = {
  recordType: 'income',
  icon: Receipt,
  estados: [
    { value: 'receivable', label: 'Por cobrar' },
    { value: 'overdue', label: 'Vencidas' },
    { value: 'paid', label: 'Pagadas' },
    { value: 'cancelled', label: 'Anuladas' },
  ],
  initialEstado: 'receivable',
  listHook: useIncome,
  monthsHook: useIncomeMonths,
  registerHook: useRegisterPayment,
  bulkRegisterHook: useBulkRegisterPayment,
  rowTotal: (r) => r.netAmount ?? r.amount,
  issueDate: (r) => r.incomeDate,
  partyName: (r) => r.clientName ?? '—',
  renderPartyCell: (r) => r.clientName ?? '—',
  amountHeader: 'Neto',
  emptyNoOrg: 'Elige una empresa arriba para ver sus cuentas por cobrar.',
  spinnerLabel: 'Cargando facturas…',
  emptyTable: 'Sin facturas en este estado',
};

export function ReceivablesTab({ organizationId }: { organizationId?: string }) {
  return <LedgerTab<IncomeRecord> organizationId={organizationId} config={config} />;
}
