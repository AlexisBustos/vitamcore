import { DocumentKind, IncomeStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { ListClientsFilters } from './clients.schema';

const orgRef = { select: { id: true, name: true } };

// Campos mínimos de cada ingreso necesarios para calcular acumulados.
const statsSelect = {
  amount: true,
  documentKind: true,
  status: true,
  paidDate: true,
  sourceIssueDate: true,
  incomeDate: true,
} as const;

type IncomeStatsRow = {
  amount: number;
  documentKind: DocumentKind;
  status: IncomeStatus;
  paidDate: Date | null;
  sourceIssueDate: Date | null;
  incomeDate: Date | null;
};

/// Acumulados derivados (no se almacenan): se calculan agregando los ingresos
/// del cliente. Las notas de crédito (monto negativo) restan del neto.
function computeStats(incomes: IncomeStatsRow[]) {
  let netSales = 0;
  let grossInvoiced = 0;
  let totalCreditNotes = 0;
  let invoiceCount = 0;
  let creditNoteCount = 0;
  let collectedAmount = 0;
  let pendingAmount = 0;
  let lastDocumentDate: Date | null = null;

  for (const inc of incomes) {
    const amount = inc.amount ?? 0;
    netSales += amount;
    if (inc.documentKind === DocumentKind.CREDIT_NOTE) {
      totalCreditNotes += Math.abs(amount);
      creditNoteCount += 1;
    } else {
      grossInvoiced += amount;
      invoiceCount += 1;
      // Cobrado vs por cobrar: solo facturas no anuladas (las NC no se cobran,
      // coherente con la pestaña de Cuentas por cobrar que excluye NC).
      if (inc.status !== IncomeStatus.CANCELLED) {
        if (inc.paidDate) collectedAmount += amount;
        else pendingAmount += amount;
      }
    }
    const date = inc.sourceIssueDate ?? inc.incomeDate;
    if (date && (!lastDocumentDate || date > lastDocumentDate)) {
      lastDocumentDate = date;
    }
  }

  return {
    netSales,
    grossInvoiced,
    totalCreditNotes,
    invoiceCount,
    creditNoteCount,
    collectedAmount,
    pendingAmount,
    documentCount: incomes.length,
    lastDocumentDate,
  };
}

export async function listClients(filters: ListClientsFilters) {
  const clients = await prisma.client.findMany({
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
      incomes: { select: statsSelect },
    },
  });

  return clients.map(({ incomes, ...client }) => ({
    ...client,
    stats: computeStats(incomes),
  }));
}

export async function getClient(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      organization: orgRef,
      incomes: {
        orderBy: [{ sourceIssueDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      },
    },
  });
  if (!client) throw notFound('Cliente no encontrado');

  return {
    ...client,
    stats: computeStats(client.incomes),
  };
}
