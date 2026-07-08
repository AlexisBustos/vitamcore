/**
 * Lógica de negocio de gastos (ExpenseRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import { resolveVendorId } from '../shared/parties';
import {
  reconcilePaidStatus,
  monthRange,
  listMonths as ledgerListMonths,
  PAYABLE_EXPENSE_STATUSES,
} from '../shared/ledger';
import type {
  BulkRegisterPaymentInput,
  CreateExpenseInput,
  ListExpenseFilters,
  RegisterPaymentInput,
  UpdateExpenseInput,
} from './expenses.schema';

const refs = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

export async function list(filters: ListExpenseFilters) {
  const where: Prisma.ExpenseRecordWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    category: filters.category,
    status: filters.status,
  };
  if (filters.isRecurring) where.isRecurring = filters.isRecurring === 'true';

  if (filters.paymentState === 'payable') {
    where.paidDate = null;
    where.status = { in: [...PAYABLE_EXPENSE_STATUSES] };
  } else if (filters.paymentState === 'overdue') {
    where.paidDate = null;
    where.status = { in: [...PAYABLE_EXPENSE_STATUSES] };
    where.dueDate = { lt: new Date() };
  } else if (filters.paymentState === 'paid') {
    where.paidDate = { not: null };
    where.status = { not: 'CANCELLED' };
  } else if (filters.paymentState === 'cancelled') {
    where.status = 'CANCELLED';
  }

  if (filters.month) where.expenseDate = monthRange(filters.month);

  // Búsqueda por nombre/folio/RUT, combinada con AND para no pisar un eventual
  // where.OR (mismo patrón que income; hoy expenses no fija OR, pero queda seguro).
  if (filters.search) {
    const s = filters.search;
    where.AND = [
      ...(where.OR ? [{ OR: where.OR }] : []),
      {
        OR: [
          { vendorName: { contains: s, mode: 'insensitive' } },
          { sourceFolio: { contains: s, mode: 'insensitive' } },
          { sourceRut: { contains: s, mode: 'insensitive' } },
        ],
      },
    ];
    delete where.OR;
  }

  return prisma.expenseRecord.findMany({
    where,
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    include: refs,
  });
}

export async function getById(id: string) {
  const rec = await prisma.expenseRecord.findUnique({
    where: { id },
    include: refs,
  });
  if (!rec) throw notFound('Gasto no encontrado');
  return rec;
}

export async function create(input: CreateExpenseInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  // Enlaza con el proveedor por nombre (lo crea si no existe) para que el
  // registro manual también sume en la cartera de proveedores.
  const vendorId = await resolveVendorId(input.organizationId, input.vendorName);
  // Si se crea directamente como PAID, reconcilePaidStatus le fija paidDate = hoy.
  return prisma.expenseRecord.create({
    data: { ...reconcilePaidStatus(input, null), vendorId },
  });
}

export async function update(id: string, input: UpdateExpenseInput) {
  const current = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { organizationId: true, paidDate: true, vendorName: true },
  });
  if (!current) throw notFound('Gasto no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  // Marcar PAID desde el form fija la fecha de pago; sacar de PAID la limpia.
  const data: Prisma.ExpenseRecordUncheckedUpdateInput = reconcilePaidStatus(
    input,
    current.paidDate,
  );
  // Re-enlaza el proveedor solo si cambió el nombre (protege los registros
  // importados de un re-enlace innecesario cuando se edita otro campo).
  if (input.vendorName !== undefined) {
    const newName = input.vendorName?.trim() ?? '';
    const oldName = current.vendorName?.trim() ?? '';
    if (newName.toLowerCase() !== oldName.toLowerCase()) {
      data.vendorId = newName
        ? await resolveVendorId(current.organizationId, newName)
        : null;
    }
  }
  return prisma.expenseRecord.update({ where: { id }, data });
}

export async function remove(id: string) {
  const exists = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Gasto no encontrado');
  await prisma.expenseRecord.delete({ where: { id } });
}

export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { id: true, organizationId: true, status: true },
  });
  if (!rec) throw notFound('Gasto no encontrado');
  if (rec.status === 'CANCELLED') throw badRequest('Un gasto anulado no se paga');

  if (input.bankTransactionId) {
    const mov = await prisma.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: { id: true, organizationId: true, chargeAmount: true, transactionDate: true },
    });
    if (!mov) throw notFound('Movimiento no encontrado');
    if (mov.organizationId !== rec.organizationId) {
      throw badRequest('El movimiento no pertenece a la empresa del gasto');
    }
    if (mov.chargeAmount <= 0) {
      throw badRequest('El movimiento no es un cargo');
    }
    return prisma.expenseRecord.update({
      where: { id },
      data: {
        paidByBankTransactionId: mov.id,
        paidDate: mov.transactionDate,
        status: 'PAID',
      },
    });
  }

  const paidDate = input.paidDate ?? null;
  return prisma.expenseRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'PENDING',
      paidByBankTransactionId: null,
    },
  });
}

// Conciliación/pago en lote. Reusa las mismas guardas y semántica que
// registerPayment, pero para varios gastos en una sola escritura atómica
// (updateMany). Con bankTransactionId concilia N gastos ↔ 1 movimiento; con
// paidDate marca pagados; con ambos en null revierte/desconcilia.
export async function bulkRegisterPayment(input: BulkRegisterPaymentInput) {
  const { ids, bankTransactionId, paidDate: inputPaidDate } = input;
  const recs = await prisma.expenseRecord.findMany({
    where: { id: { in: ids } },
    select: { id: true, organizationId: true, status: true },
  });
  if (recs.length !== ids.length) throw notFound('Algún gasto no fue encontrado');

  const orgIds = new Set(recs.map((r) => r.organizationId));
  if (orgIds.size > 1) {
    throw badRequest('Los gastos seleccionados deben ser de la misma empresa');
  }
  for (const r of recs) {
    if (r.status === 'CANCELLED') {
      throw badRequest('La selección incluye un gasto anulado, que no se paga');
    }
  }

  if (bankTransactionId) {
    const mov = await prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      select: { id: true, organizationId: true, chargeAmount: true, transactionDate: true },
    });
    if (!mov) throw notFound('Movimiento no encontrado');
    if (mov.organizationId !== recs[0].organizationId) {
      throw badRequest('El movimiento no pertenece a la empresa de los gastos');
    }
    if (mov.chargeAmount <= 0) throw badRequest('El movimiento no es un cargo');
    await prisma.expenseRecord.updateMany({
      where: { id: { in: ids } },
      data: {
        paidByBankTransactionId: mov.id,
        paidDate: mov.transactionDate,
        status: 'PAID',
      },
    });
    return { count: ids.length };
  }

  const paidDate = inputPaidDate ?? null;
  await prisma.expenseRecord.updateMany({
    where: { id: { in: ids } },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'PENDING',
      paidByBankTransactionId: null,
    },
  });
  return { count: ids.length };
}

/// Meses (YYYY-MM) que tienen gastos, ordenados descendente. Alimenta el filtro por mes.
export async function listMonths(organizationId?: string): Promise<string[]> {
  return ledgerListMonths('expense', organizationId);
}
