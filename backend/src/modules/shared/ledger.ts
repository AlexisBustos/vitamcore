/**
 * Helpers compartidos del ledger (ingresos/gastos): invariante de pago, rango de
 * mes y listado de meses con datos. Extraídos de income.service/expenses.service
 * para no duplicar la lógica entre ambos dominios.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

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

// Rango [gte, lt) del mes YYYY-MM en UTC, para filtrar por fecha.
export function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

// Whitelist tipada: el identificador de tabla/columna NO puede ir como parámetro.
const MONTHS_SOURCES = {
  income: { table: 'income_records', column: 'incomeDate' },
  expense: { table: 'expense_records', column: 'expenseDate' },
} as const;

// Meses (YYYY-MM) con datos, desc. `organizationId` sí va parametrizado.
export async function listMonths(
  source: keyof typeof MONTHS_SOURCES,
  organizationId?: string,
): Promise<string[]> {
  const { table, column } = MONTHS_SOURCES[source];
  const orgClause = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('month', ${Prisma.raw(`"${column}"`)}), 'YYYY-MM') AS mes
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.raw(`"${column}"`)} IS NOT NULL ${orgClause}
    ORDER BY mes DESC
  `);
  return rows.map((r) => r.mes);
}
