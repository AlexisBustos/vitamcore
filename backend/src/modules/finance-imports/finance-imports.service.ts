import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';

export { listBankAccounts, createBankAccount, updateBankAccount } from './bank-accounts.service';
export {
  listBankTransactions,
  listBankTransactionMonths,
  listBankMonthly,
  listBankByCategory,
  setCategoryBulk,
  setTransactionCategory,
} from './bank-transactions.service';
export { previewImport, confirmImport, listBatches, getBatch } from './import-pipeline.service';

export async function listReconciliationCandidates(filters: {
  recordType: 'income' | 'expense';
  recordId: string;
  search?: string;
}) {
  let organizationId: string;
  let target: number;
  let refDate: Date | null;
  const direction = filters.recordType === 'income' ? 'credit' : 'charge';

  if (filters.recordType === 'income') {
    const rec = await prisma.incomeRecord.findUnique({
      where: { id: filters.recordId },
      select: { organizationId: true, amount: true, netAmount: true, incomeDate: true, dueDate: true },
    });
    if (!rec) throw notFound('Ingreso no encontrado');
    organizationId = rec.organizationId;
    target = rec.netAmount ?? rec.amount;
    refDate = rec.incomeDate ?? rec.dueDate ?? null;
  } else {
    const rec = await prisma.expenseRecord.findUnique({
      where: { id: filters.recordId },
      select: { organizationId: true, amount: true, expenseDate: true, dueDate: true },
    });
    if (!rec) throw notFound('Gasto no encontrado');
    organizationId = rec.organizationId;
    target = rec.amount;
    refDate = rec.expenseDate ?? rec.dueDate ?? null;
  }

  const searchWhere: Prisma.BankTransactionWhereInput = filters.search
    ? { description: { contains: filters.search, mode: 'insensitive' } }
    : {};

  const dirWhere: Prisma.BankTransactionWhereInput =
    direction === 'credit'
      ? { ...searchWhere, organizationId, creditAmount: { gt: 0 } }
      : { ...searchWhere, organizationId, chargeAmount: { gt: 0 } };
  const exactWhere: Prisma.BankTransactionWhereInput =
    direction === 'credit'
      ? { ...searchWhere, organizationId, creditAmount: target }
      : { ...searchWhere, organizationId, chargeAmount: target };

  const [exactRows, recentRows] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: exactWhere,
      orderBy: { transactionDate: 'desc' },
      take: 50,
    }),
    prisma.bankTransaction.findMany({
      where: dirWhere,
      orderBy: { transactionDate: 'desc' },
      take: 100,
    }),
  ]);

  const byId = new Map<string, (typeof recentRows)[number]>();
  for (const t of [...exactRows, ...recentRows]) byId.set(t.id, t);

  const refTime = refDate ? refDate.getTime() : null;
  const ranked = [...byId.values()]
    .map((t) => {
      const amount = direction === 'credit' ? t.creditAmount : t.chargeAmount;
      return {
        id: t.id,
        transactionDate: t.transactionDate,
        description: t.description,
        amount,
        exact: amount === target,
        dist: refTime ? Math.abs(t.transactionDate.getTime() - refTime) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => (a.exact !== b.exact ? (a.exact ? -1 : 1) : a.dist - b.dist));

  const limit = filters.search ? 20 : 8;
  return ranked.slice(0, limit).map(({ dist: _dist, ...c }) => c);
}
