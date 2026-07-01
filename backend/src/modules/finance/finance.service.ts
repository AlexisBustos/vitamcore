/**
 * Resumen financiero ejecutivo (ingresos + gastos).
 * Reutilizado por la página Finanzas y por el dashboard.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { currentMonthRange } from '../shared/dates';
import {
  computeReceivablePayable,
  computeOverdue,
  INCOME_PENDING,
  EXPENSE_PENDING,
} from './finance-shared';
import { getReconciliationSummary } from './finance-reconciliation.service';
// Re-export para mantener la API pública del módulo finance (usada por el
// controller vía `* as service`) tras mover la lógica de conciliación.
export {
  getReconciliationSummary,
  autoReconcile,
  recognizeTransfers,
} from './finance-reconciliation.service';

export async function getSummary(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};
  const { start, end } = currentMonthRange();
  const now = new Date();

  const [
    monthIncome,
    monthExpense,
    recurringIncome,
    recurringExpense,
    incomeByCategory,
    expenseByCategory,
    incomeByOrg,
    expenseByOrg,
    upcomingIncome,
    upcomingExpense,
    collectedIncome,
    recPay,
    overdue,
  ] = await Promise.all([
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
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
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
    prisma.incomeRecord.findMany({
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        dueDate: { gte: now },
        status: { in: INCOME_PENDING },
      },
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
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: { ...orgFilter, status: { not: 'CANCELLED' }, paidDate: { not: null } },
    }),
    computeReceivablePayable(organizationId),
    computeOverdue(organizationId),
  ]);

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;

  const monthIncomeTotal = monthIncome._sum.amount ?? 0;
  const monthExpenseTotal = monthExpense._sum.amount ?? 0;

  const byOrgMap = new Map<string, { income: number; expense: number }>();
  for (const r of incomeByOrg) {
    byOrgMap.set(r.organizationId, { income: r._sum.amount ?? 0, expense: 0 });
  }
  for (const r of expenseByOrg) {
    const cur = byOrgMap.get(r.organizationId) ?? { income: 0, expense: 0 };
    cur.expense = r._sum.amount ?? 0;
    byOrgMap.set(r.organizationId, cur);
  }

  const upcomingFinancial = [
    ...upcomingIncome.map((i) => ({ ...i, kind: 'INCOME' as const })),
    ...upcomingExpense.map((e) => ({ ...e, kind: 'EXPENSE' as const })),
  ]
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 8);

  return {
    monthIncome: monthIncomeTotal,
    monthExpense: monthExpenseTotal,
    estimatedResult: monthIncomeTotal - monthExpenseTotal,
    pendingIncome: recPay.receivable,
    collectedIncome: collectedIncome._sum.netAmount ?? 0,
    pendingExpense: recPay.payable,
    recurringIncome: recurringIncome._sum.amount ?? 0,
    recurringExpense: recurringExpense._sum.amount ?? 0,
    overdueIncome: overdue.overdueReceivable,
    overdueExpense: overdue.overduePayable,
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

/**
 * Posición consolidada (foto al día) + cuadre del mes. Reemplaza a
 * getFinancePosition. La posición ignora `month`; solo `reconciliation` lo usa.
 */
export async function getConsolidated(filters: {
  organizationId?: string;
  month?: string;
}) {
  const { organizationId, month } = filters;

  const [cashRows, recPay, overdue, orgs, reconciliation] = await Promise.all([
    prisma.$queryRaw<{ organizationId: string; caja: bigint }[]>(Prisma.sql`
      SELECT ba."organizationId", COALESCE(SUM(last.balance), 0)::bigint AS caja
      FROM "bank_accounts" ba
      LEFT JOIN LATERAL (
        SELECT t.balance FROM "bank_transactions" t
        WHERE t."bankAccountId" = ba.id
        ORDER BY t."transactionDate" DESC, t."createdAt" DESC
        LIMIT 1
      ) last ON true
      WHERE ba."isActive" = true ${
        organizationId
          ? Prisma.sql`AND ba."organizationId" = ${organizationId}`
          : Prisma.empty
      }
      GROUP BY ba."organizationId"
    `),
    computeReceivablePayable(organizationId),
    computeOverdue(organizationId),
    prisma.organization.findMany({ select: { id: true, name: true } }),
    getReconciliationSummary({ organizationId, month }),
  ]);

  const cashByOrg = new Map<string, number>();
  for (const r of cashRows) cashByOrg.set(r.organizationId, Number(r.caja));

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const ids = new Set<string>([...cashByOrg.keys(), ...recPay.byOrg.keys()]);

  const byOrganization = [...ids]
    .map((id) => {
      const cash = cashByOrg.get(id) ?? 0;
      const rp = recPay.byOrg.get(id) ?? { receivable: 0, payable: 0 };
      return {
        organizationId: id,
        name: orgName(id),
        cash,
        receivable: rp.receivable,
        payable: rp.payable,
        position: cash + rp.receivable - rp.payable,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cash = byOrganization.reduce((s, o) => s + o.cash, 0);

  return {
    cash,
    receivable: recPay.receivable,
    payable: recPay.payable,
    position: cash + recPay.receivable - recPay.payable,
    overdueReceivable: overdue.overdueReceivable,
    overduePayable: overdue.overduePayable,
    byOrganization,
    reconciliation,
  };
}
