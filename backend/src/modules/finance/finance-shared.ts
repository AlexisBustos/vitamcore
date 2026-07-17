/**
 * Helpers de cómputo compartidos entre getSummary y getConsolidated.
 * Única fuente de verdad para por cobrar/por pagar y vencidos.
 */
import { type ExpenseStatus, type IncomeStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const INCOME_PENDING: IncomeStatus[] = ['EXPECTED', 'INVOICED', 'OVERDUE'];
export const EXPENSE_PENDING: ExpenseStatus[] = ['PENDING', 'OVERDUE'];

export type RecPay = {
  receivable: number;
  payable: number;
  byOrg: Map<string, { receivable: number; payable: number }>;
};

/**
 * Por cobrar / por pagar por empresa + totales. Única fuente de verdad,
 * reusada por getSummary y getConsolidated (antes estaba duplicada inline).
 */
export async function computeReceivablePayable(organizationId?: string): Promise<RecPay> {
  const orgFilter = organizationId ? { organizationId } : {};
  const [pendingSales, pendingManual, pendingExpense] = await Promise.all([
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
  ]);

  const byOrg = new Map<string, { receivable: number; payable: number }>();
  const bump = (id: string, key: 'receivable' | 'payable', v: number) => {
    const cur = byOrg.get(id) ?? { receivable: 0, payable: 0 };
    cur[key] += v;
    byOrg.set(id, cur);
  };
  for (const r of pendingSales) bump(r.organizationId, 'receivable', r._sum.netAmount ?? 0);
  for (const r of pendingManual) bump(r.organizationId, 'receivable', r._sum.amount ?? 0);
  for (const r of pendingExpense) bump(r.organizationId, 'payable', r._sum.amount ?? 0);

  let receivable = 0;
  let payable = 0;
  for (const v of byOrg.values()) {
    receivable += v.receivable;
    payable += v.payable;
  }
  return { receivable, payable, byOrg };
}

/**
 * Vencidos (por cobrar / por pagar). Extraído del inline de getSummary para
 * reusarlo en getConsolidated sin duplicarlo.
 */
export async function computeOverdue(organizationId?: string): Promise<{
  overdueReceivable: { amount: number; count: number };
  overduePayable: { amount: number; count: number };
}> {
  const orgFilter = organizationId ? { organizationId } : {};
  const now = new Date();
  const [overdueSales, overdueManual, overdueExpense] = await Promise.all([
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
  ]);
  return {
    overdueReceivable: {
      count: overdueSales._count._all + overdueManual._count._all,
      amount: (overdueSales._sum.netAmount ?? 0) + (overdueManual._sum.amount ?? 0),
    },
    overduePayable: {
      count: overdueExpense._count._all,
      amount: overdueExpense._sum.amount ?? 0,
    },
  };
}

/**
 * Por cobrar / por pagar que vencen en los próximos `days` días (ventana
 * [ahora, ahora + days]). Espejo de computeOverdue pero hacia adelante; usa los
 * mismos filtros de pendientes para no divergir. Reusado por el motor de alertas.
 */
export async function computeUpcoming(
  organizationId: string | undefined,
  days: number,
): Promise<{
  upcomingReceivable: { amount: number; count: number };
  upcomingPayable: { amount: number; count: number };
}> {
  const orgFilter = organizationId ? { organizationId } : {};
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  const window = { gte: now, lte: until };
  const [upcomingSales, upcomingManual, upcomingExpense] = await Promise.all([
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
        dueDate: window,
      },
    }),
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        netAmount: null,
        status: { in: INCOME_PENDING },
        dueDate: window,
      },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...orgFilter, dueDate: window, status: { in: EXPENSE_PENDING } },
    }),
  ]);
  return {
    upcomingReceivable: {
      count: upcomingSales._count._all + upcomingManual._count._all,
      amount: (upcomingSales._sum.netAmount ?? 0) + (upcomingManual._sum.amount ?? 0),
    },
    upcomingPayable: {
      count: upcomingExpense._count._all,
      amount: upcomingExpense._sum.amount ?? 0,
    },
  };
}
