/**
 * Resumen financiero ejecutivo (ingresos + gastos).
 * Reutilizado por la página Finanzas y por el dashboard.
 */
import type { ExpenseStatus, IncomeStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { currentMonthRange } from '../shared/dates';

const INCOME_PENDING: IncomeStatus[] = ['EXPECTED', 'INVOICED', 'OVERDUE'];
const EXPENSE_PENDING: ExpenseStatus[] = ['PENDING', 'OVERDUE'];

export async function getSummary(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};
  const { start, end } = currentMonthRange();
  const now = new Date();

  const [
    monthIncome,
    monthExpense,
    pendingIncome,
    pendingExpense,
    recurringIncome,
    recurringExpense,
    overdueIncome,
    overdueExpense,
    incomeByCategory,
    expenseByCategory,
    incomeByOrg,
    expenseByOrg,
    upcomingIncome,
    upcomingExpense,
  ] = await Promise.all([
    // Totales del mes (por fecha de ingreso/gasto, excluyendo cancelados).
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        incomeDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        expenseDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    }),
    // Pendientes (no pagados ni cancelados).
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, status: { in: INCOME_PENDING } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, status: { in: EXPENSE_PENDING } },
    }),
    // Recurrentes.
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    // Vencidos (con vencimiento pasado y aún no resueltos).
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...orgFilter, dueDate: { lt: now }, status: { in: INCOME_PENDING } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...orgFilter, dueDate: { lt: now }, status: { in: EXPENSE_PENDING } },
    }),
    // Desglose por categoría.
    prisma.incomeRecord.groupBy({
      by: ['category'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ['category'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    // Desglose por empresa.
    prisma.incomeRecord.groupBy({
      by: ['organizationId'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ['organizationId'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    // Próximos vencimientos financieros.
    prisma.incomeRecord.findMany({
      where: { ...orgFilter, dueDate: { gte: now }, status: { in: INCOME_PENDING } },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true, description: true, amount: true, currency: true,
        dueDate: true, status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.expenseRecord.findMany({
      where: { ...orgFilter, dueDate: { gte: now }, status: { in: EXPENSE_PENDING } },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true, description: true, amount: true, currency: true,
        dueDate: true, status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
  ]);

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;

  const monthIncomeTotal = monthIncome._sum.amount ?? 0;
  const monthExpenseTotal = monthExpense._sum.amount ?? 0;

  // Combina ingresos/gastos por empresa para el desglose.
  const byOrgMap = new Map<string, { income: number; expense: number }>();
  for (const r of incomeByOrg) {
    byOrgMap.set(r.organizationId, {
      income: r._sum.amount ?? 0,
      expense: 0,
    });
  }
  for (const r of expenseByOrg) {
    const cur = byOrgMap.get(r.organizationId) ?? { income: 0, expense: 0 };
    cur.expense = r._sum.amount ?? 0;
    byOrgMap.set(r.organizationId, cur);
  }

  // Combina y ordena vencimientos por fecha.
  const upcomingFinancial = [
    ...upcomingIncome.map((i) => ({ ...i, kind: 'INCOME' as const })),
    ...upcomingExpense.map((e) => ({ ...e, kind: 'EXPENSE' as const })),
  ]
    .sort(
      (a, b) =>
        (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0),
    )
    .slice(0, 8);

  return {
    monthIncome: monthIncomeTotal,
    monthExpense: monthExpenseTotal,
    estimatedResult: monthIncomeTotal - monthExpenseTotal,
    pendingIncome: pendingIncome._sum.amount ?? 0,
    pendingExpense: pendingExpense._sum.amount ?? 0,
    recurringIncome: recurringIncome._sum.amount ?? 0,
    recurringExpense: recurringExpense._sum.amount ?? 0,
    overdueIncome: {
      count: overdueIncome._count._all,
      amount: overdueIncome._sum.amount ?? 0,
    },
    overdueExpense: {
      count: overdueExpense._count._all,
      amount: overdueExpense._sum.amount ?? 0,
    },
    incomeByCategory: incomeByCategory.map((c) => ({
      category: c.category ?? 'Sin categoría',
      amount: c._sum.amount ?? 0,
    })),
    expenseByCategory: expenseByCategory.map((c) => ({
      category: c.category ?? 'Sin categoría',
      amount: c._sum.amount ?? 0,
    })),
    byOrganization: Array.from(byOrgMap.entries()).map(([id, v]) => ({
      id,
      name: orgName(id),
      income: v.income,
      expense: v.expense,
      result: v.income - v.expense,
    })),
    upcomingFinancial,
  };
}
