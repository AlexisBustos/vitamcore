/**
 * Resumen financiero ejecutivo (ingresos + gastos).
 * Reutilizado por la página Finanzas y por el dashboard.
 */
import { Prisma, type ExpenseStatus, type IncomeStatus } from '@prisma/client';
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
    pendingSales,      // (antes pendingIncome) — dividido en ventas + manuales
    pendingManual,
    pendingExpense,
    recurringIncome,
    recurringExpense,
    overdueSales,      // (antes overdueIncome) — dividido en ventas + manuales
    overdueManual,
    overdueExpense,
    incomeByCategory,
    expenseByCategory,
    incomeByOrg,
    expenseByOrg,
    upcomingIncome,
    upcomingExpense,
    collectedIncome,   // nuevo — va al final
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
    // Por cobrar (ventas): neto positivo, no pagado, excluye notas de crédito.
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
      },
    }),
    // Por cobrar (ingresos manuales): sin neto calculado, por estado clásico.
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        netAmount: null,
        status: { in: INCOME_PENDING },
      },
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
    // Vencido (ventas): por cobrar con dueDate pasado.
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
        dueDate: { lt: now },
      },
    }),
    // Vencido (manuales).
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        netAmount: null,
        status: { in: INCOME_PENDING },
        dueDate: { lt: now },
      },
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
    // Cobrado: facturas con pago registrado.
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: { ...orgFilter, status: { not: 'CANCELLED' }, paidDate: { not: null } },
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
    pendingIncome:
      (pendingSales._sum.netAmount ?? 0) + (pendingManual._sum.amount ?? 0),
    collectedIncome: collectedIncome._sum.netAmount ?? 0,
    pendingExpense: pendingExpense._sum.amount ?? 0,
    recurringIncome: recurringIncome._sum.amount ?? 0,
    recurringExpense: recurringExpense._sum.amount ?? 0,
    overdueIncome: {
      count: overdueSales._count._all + overdueManual._count._all,
      amount:
        (overdueSales._sum.netAmount ?? 0) + (overdueManual._sum.amount ?? 0),
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

export async function getFinancePosition(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};

  const [cashRows, pendingSales, pendingManual, pendingExpense, orgs] =
    await Promise.all([
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
      prisma.incomeRecord.groupBy({
        by: ['organizationId'],
        _sum: { netAmount: true },
        where: {
          ...orgFilter,
          documentKind: { not: 'CREDIT_NOTE' },
          status: { not: 'CANCELLED' },
          paidDate: null,
          netAmount: { gt: 0 },
        },
      }),
      prisma.incomeRecord.groupBy({
        by: ['organizationId'],
        _sum: { amount: true },
        where: {
          ...orgFilter,
          documentKind: { not: 'CREDIT_NOTE' },
          netAmount: null,
          status: { in: INCOME_PENDING },
        },
      }),
      prisma.expenseRecord.groupBy({
        by: ['organizationId'],
        _sum: { amount: true },
        where: { ...orgFilter, status: { in: EXPENSE_PENDING } },
      }),
      prisma.organization.findMany({ select: { id: true, name: true } }),
    ]);

  const cashByOrg = new Map<string, number>();
  for (const r of cashRows) cashByOrg.set(r.organizationId, Number(r.caja));

  const recByOrg = new Map<string, number>();
  for (const r of pendingSales) {
    recByOrg.set(
      r.organizationId,
      (recByOrg.get(r.organizationId) ?? 0) + (r._sum.netAmount ?? 0),
    );
  }
  for (const r of pendingManual) {
    recByOrg.set(
      r.organizationId,
      (recByOrg.get(r.organizationId) ?? 0) + (r._sum.amount ?? 0),
    );
  }

  const payByOrg = new Map<string, number>();
  for (const r of pendingExpense) {
    payByOrg.set(r.organizationId, r._sum.amount ?? 0);
  }

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const ids = new Set<string>([
    ...cashByOrg.keys(),
    ...recByOrg.keys(),
    ...payByOrg.keys(),
  ]);

  const byOrganization = [...ids]
    .map((id) => {
      const cash = cashByOrg.get(id) ?? 0;
      const receivable = recByOrg.get(id) ?? 0;
      const payable = payByOrg.get(id) ?? 0;
      return {
        id,
        name: orgName(id),
        cash,
        receivable,
        payable,
        position: cash + receivable - payable,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cash = byOrganization.reduce((s, o) => s + o.cash, 0);
  const receivable = byOrganization.reduce((s, o) => s + o.receivable, 0);
  const payable = byOrganization.reduce((s, o) => s + o.payable, 0);

  return {
    cash,
    receivable,
    payable,
    position: cash + receivable - payable,
    byOrganization,
  };
}
