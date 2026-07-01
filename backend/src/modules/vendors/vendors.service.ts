import { ExpenseStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  buildPartyWhere,
  orgRef,
  partyDocumentsDetailArgs,
  partyListOrderBy,
  requireParty,
} from '../shared/party-stats';
import type { ListVendorsFilters } from './vendors.schema';

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
  let documentCount = 0;
  let lastDocumentDate: Date | null = null;

  for (const exp of expenses) {
    if (exp.status === ExpenseStatus.CANCELLED) continue;
    totalSpent += exp.amount ?? 0;
    if (exp.paidDate) paidAmount += exp.amount ?? 0;
    documentCount += 1;
    const date = exp.sourceIssueDate ?? exp.expenseDate;
    if (date && (!lastDocumentDate || date > lastDocumentDate)) {
      lastDocumentDate = date;
    }
  }

  return {
    totalSpent,
    paidAmount,
    pendingAmount: totalSpent - paidAmount,
    documentCount,
    lastDocumentDate,
  };
}

export async function listVendors(filters: ListVendorsFilters) {
  const vendors = await prisma.vendor.findMany({
    where: buildPartyWhere(filters.organizationId, filters.search),
    orderBy: partyListOrderBy(),
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
  const vendor = requireParty(
    await prisma.vendor.findUnique({
      where: { id },
      include: {
        organization: orgRef,
        expenses: partyDocumentsDetailArgs(),
      },
    }),
    'Proveedor no encontrado',
  );

  return {
    ...vendor,
    stats: computeStats(vendor.expenses),
  };
}
