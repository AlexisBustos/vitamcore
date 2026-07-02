// Estado compartido de cobro (cliente) / pago (proveedor) para facturas y gastos.
// Centraliza la derivación de estado y sus etiquetas/clases de color, hoy duplicadas
// inline en ClientDetailPage.tsx (estadoCobro) y VendorDetailPage.tsx (estadoPago).
// Clave interna unificada 'pending' cubre tanto 'receivable' (cliente) como 'pending'
// (proveedor); los labels visibles se mantienen separados por dominio.
import type { IncomeRecord, ExpenseRecord } from '@/types/domain';

export type PaymentState = 'paid' | 'overdue' | 'pending' | 'cancelled';

// Clases de color compartidas (idénticas en ambos gemelos hoy).
export const PAYMENT_STATE_CLASS: Record<PaymentState, string> = {
  paid: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  overdue: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  pending: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  cancelled: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

// Labels difieren entre cobro (cliente) y pago (proveedor).
export const RECEIVABLE_LABEL: Record<PaymentState, string> = {
  paid: 'Pagada', overdue: 'Vencida', pending: 'Por cobrar', cancelled: 'Anulada',
};
export const PAYABLE_LABEL: Record<PaymentState, string> = {
  paid: 'Pagado', overdue: 'Vencido', pending: 'Pendiente', cancelled: 'Anulado',
};

// Estado de cobro de una factura (alineado con income.service paymentState):
// anulada = netAmount 0; pagada = paidDate; vencida = dueDate pasado sin pago.
export function deriveReceivableState(inc: IncomeRecord): PaymentState {
  if (inc.netAmount === 0) return 'cancelled';
  if (inc.paidDate) return 'paid';
  if (inc.dueDate && new Date(inc.dueDate) < new Date()) return 'overdue';
  return 'pending';
}

// Estado de pago de un gasto (alineado con expenses.service paymentState).
export function derivePayableState(exp: ExpenseRecord): PaymentState {
  if (exp.status === 'CANCELLED') return 'cancelled';
  if (exp.paidDate) return 'paid';
  if (exp.dueDate && new Date(exp.dueDate) < new Date()) return 'overdue';
  return 'pending';
}

// Opciones de filtro (orden idéntico a los gemelos: paid, overdue, pending, cancelled).
export const receivableStateOptions: { value: PaymentState; label: string }[] =
  (['paid','overdue','pending','cancelled'] as PaymentState[]).map((s) => ({ value: s, label: RECEIVABLE_LABEL[s] }));
export const payableStateOptions: { value: PaymentState; label: string }[] =
  (['paid','overdue','pending','cancelled'] as PaymentState[]).map((s) => ({ value: s, label: PAYABLE_LABEL[s] }));
