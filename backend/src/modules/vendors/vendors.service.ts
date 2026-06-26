import { ExpenseStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { ListVendorsFilters } from './vendors.schema';

const orgRef = { select: { id: true, name: true } };

// Campos mínimos de cada gasto necesarios para calcular acumulados.
const statsSelect = {
  amount: true,
  status: true,
  paidDate: true,
  sourceIssueDate: true,
  expenseDate: true,
} as const;

type ExpenseStatsRow = {
  amount: number;
  status: ExpenseStatus;
  paidDate: Date | null;
  sourceIssueDate: Date | null;
  expenseDate: Date | null;
};

/// Acumulados derivados (no se almacenan): se calculan agregando los gastos del
/// proveedor. Los gastos anulados (CANCELLED) se excluyen de los totales.
function computeStats(expenses: ExpenseStatsRow[]) {
  let totalSpent = 0;
  let paidAmount = 0;
  let lastDocumentDate: Date | null = null;

  for (const exp of expenses) {
    if (exp.status !== ExpenseStatus.CANCELLED) {
      totalSpent += exp.amount ?? 0;
      if (exp.paidDate) paidAmount += exp.amount ?? 0;
    }
    const date = exp.sourceIssueDate ?? exp.expenseDate;
    if (date && (!lastDocumentDate || date > lastDocumentDate)) {
      lastDocumentDate = date;
    }
  }

  return {
    totalSpent,
    paidAmount,
    pendingAmount: totalSpent - paidAmount,
    documentCount: expenses.length,
    lastDocumentDate,
  };
}

export async function listVendors(filters: ListVendorsFilters) {
  const vendors = await prisma.vendor.findMany({
    where: {
      organizationId: filters.organizationId,
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { rut: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
    include: {
      organization: orgRef,
      expenses: { select: statsSelect },
    },
  });

  return vendors.map(({ expenses, ...vendor }) => ({
    ...vendor,
    stats: computeStats(expenses),
  }));
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      organization: orgRef,
      expenses: {
        orderBy: [{ sourceIssueDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      },
    },
  });
  if (!vendor) throw notFound('Proveedor no encontrado');

  return {
    ...vendor,
    stats: computeStats(vendor.expenses),
  };
}
