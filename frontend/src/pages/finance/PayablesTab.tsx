// Wrapper delgado de LedgerTab para el libro de cuentas por pagar (gastos).
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { LedgerTab, type LedgerTabConfig } from '@/components/finance/LedgerTab';
import {
  useExpenses,
  useExpensePeriods,
  useRegisterExpensePayment,
  useBulkRegisterExpensePayment,
} from '@/hooks/useFinance';
import type { ExpenseRecord } from '@/types/domain';

const config: LedgerTabConfig<ExpenseRecord> = {
  recordType: 'expense',
  icon: CreditCard,
  estados: [
    { value: 'payable', label: 'Por pagar' },
    { value: 'overdue', label: 'Vencidas' },
    { value: 'paid', label: 'Pagadas' },
    { value: 'cancelled', label: 'Anuladas' },
  ],
  initialEstado: 'payable',
  listHook: useExpenses,
  periodsHook: useExpensePeriods,
  registerHook: useRegisterExpensePayment,
  bulkRegisterHook: useBulkRegisterExpensePayment,
  rowTotal: (r) => r.amount,
  issueDate: (r) => r.expenseDate,
  partyName: (r) => r.vendorName ?? '—',
  renderPartyCell: (r) =>
    r.vendorName ? (
      r.vendorId ? (
        <Link
          to={`/proveedores/${r.vendorId}`}
          className="text-[var(--color-primary)] hover:underline"
        >
          {r.vendorName}
        </Link>
      ) : (
        <span className="text-[var(--color-muted-foreground)]">
          {r.vendorName}
        </span>
      )
    ) : (
      '—'
    ),
  amountHeader: 'Monto',
  emptyNoOrg: 'Elige una empresa arriba para ver sus cuentas por pagar.',
  spinnerLabel: 'Cargando gastos…',
  emptyTable: 'Sin gastos en este estado',
};

export function PayablesTab({ organizationId }: { organizationId?: string }) {
  return <LedgerTab<ExpenseRecord> organizationId={organizationId} config={config} />;
}
