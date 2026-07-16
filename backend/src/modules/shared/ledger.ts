/**
 * Helpers compartidos del ledger (ingresos/gastos): invariante de pago, rango de
 * mes y listado de meses con datos. Extraídos de income.service/expenses.service
 * para no duplicar la lógica entre ambos dominios.
 */
import { periodRange, listPeriods } from './period';

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

// Shims de compatibilidad: la implementación real vive en period.ts. Se
// conservan aquí para no tocar los imports de ledger.test.ts durante la Fase 0
// (misma estrategia que el barrel de frontend/src/hooks/useFinance.ts).
// Mueren en la Fase 3, cuando sus describe se muden a period.test.ts.

/** @deprecated usa periodRange('month', …) */
export function monthRange(month: string): { gte: Date; lt: Date } {
  return periodRange('month', month);
}

/** @deprecated usa listPeriods('month', { source, organizationId }) */
export function listMonths(
  source: 'income' | 'expense',
  organizationId?: string,
): Promise<string[]> {
  return listPeriods('month', { source, organizationId });
}
