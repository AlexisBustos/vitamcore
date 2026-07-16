/**
 * Helpers compartidos del ledger (ingresos/gastos): invariante de pago y estados
 * pendientes. La lógica de períodos vive en period.ts.
 */

// Estados de un ingreso aún por cobrar.
export const PENDING_INCOME_STATUSES = ['EXPECTED', 'INVOICED', 'OVERDUE'] as const;
// Estados de un gasto aún por pagar.
export const PAYABLE_EXPENSE_STATUSES = ['PENDING', 'OVERDUE'] as const;

// Invariante de pago: PAID ⇔ hay paidDate. Al marcar PAID sin fecha se fija hoy;
// al salir de PAID se limpia paidDate y el vínculo bancario. Común a income/expenses.
export function reconcilePaidStatus<T extends { status?: string | null }>(
  input: T,
  currentPaidDate: Date | null,
): T & { paidDate?: Date | null; paidByBankTransactionId?: string | null } {
  if (input.status === undefined) return input;
  if (input.status === 'PAID') {
    return { ...input, paidDate: currentPaidDate ?? new Date() };
  }
  return { ...input, paidDate: null, paidByBankTransactionId: null };
}
