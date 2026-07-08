/**
 * Lógica de negocio de ingresos (IncomeRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import { resolveClientId } from '../shared/parties';
import {
  reconcilePaidStatus,
  monthRange,
  listMonths as ledgerListMonths,
  PENDING_INCOME_STATUSES,
} from '../shared/ledger';
import type {
  BulkRegisterPaymentInput,
  CreateIncomeInput,
  ListIncomeFilters,
  RegisterPaymentInput,
  UpdateIncomeInput,
} from './income.schema';

const refs = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

// "Saldo por cobrar" coherente con los KPIs de finance.service: usa netAmount
// cuando está calculado (ventas importadas) y, si no, cae al estado clásico
// (ingresos manuales o ventas legacy sin netAmount). Sin esto, el KPI y la
// pestaña de Cuentas por cobrar pueden descuadrar.
const RECEIVABLE_OR: Prisma.IncomeRecordWhereInput['OR'] = [
  { netAmount: { gt: 0 }, status: { not: 'CANCELLED' } },
  { netAmount: null, status: { in: [...PENDING_INCOME_STATUSES] } },
];

export async function list(filters: ListIncomeFilters) {
  const where: Prisma.IncomeRecordWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    category: filters.category,
    status: filters.status,
  };
  if (filters.isRecurring) where.isRecurring = filters.isRecurring === 'true';

  if (filters.documentKind) where.documentKind = filters.documentKind;
  const excludeNC = () => {
    if (!filters.documentKind) where.documentKind = { not: 'CREDIT_NOTE' };
  };
  if (filters.paymentState === 'receivable') {
    excludeNC();
    where.paidDate = null;
    where.OR = RECEIVABLE_OR;
  } else if (filters.paymentState === 'overdue') {
    excludeNC();
    where.paidDate = null;
    where.dueDate = { lt: new Date() };
    where.OR = RECEIVABLE_OR;
  } else if (filters.paymentState === 'paid') {
    where.paidDate = { not: null };
    where.status = { not: 'CANCELLED' };
  } else if (filters.paymentState === 'cancelled') {
    where.netAmount = 0;
  }

  if (filters.month) {
    where.incomeDate = monthRange(filters.month);
  }

  // Búsqueda por nombre/folio/RUT. paymentState ya pudo fijar where.OR (RECEIVABLE_OR),
  // así que combinamos ambos con AND para no pisarnos.
  if (filters.search) {
    const s = filters.search;
    where.AND = [
      ...(where.OR ? [{ OR: where.OR }] : []),
      {
        OR: [
          { clientName: { contains: s, mode: 'insensitive' } },
          { sourceFolio: { contains: s, mode: 'insensitive' } },
          { sourceRut: { contains: s, mode: 'insensitive' } },
        ],
      },
    ];
    delete where.OR;
  }

  return prisma.incomeRecord.findMany({
    where,
    orderBy: [{ incomeDate: 'desc' }, { createdAt: 'desc' }],
    include: refs,
  });
}

export async function getById(id: string) {
  const rec = await prisma.incomeRecord.findUnique({
    where: { id },
    include: refs,
  });
  if (!rec) throw notFound('Ingreso no encontrado');
  return rec;
}

export async function create(input: CreateIncomeInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  // Enlaza con el cliente por nombre (lo crea si no existe) para que el registro
  // manual también sume en la cartera de clientes.
  const clientId = await resolveClientId(input.organizationId, input.clientName);
  // Si se crea directamente como PAID, reconcilePaidStatus le fija paidDate = hoy.
  return prisma.incomeRecord.create({
    data: { ...reconcilePaidStatus(input, null), clientId },
  });
}

export async function update(id: string, input: UpdateIncomeInput) {
  const current = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { organizationId: true, paidDate: true, clientName: true },
  });
  if (!current) throw notFound('Ingreso no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  // Marcar PAID desde el form fija la fecha de cobro; sacar de PAID la limpia.
  const data: Prisma.IncomeRecordUncheckedUpdateInput = reconcilePaidStatus(
    input,
    current.paidDate,
  );
  // Re-enlaza el cliente solo si cambió el nombre (protege los registros
  // importados de un re-enlace innecesario cuando se edita otro campo).
  if (input.clientName !== undefined) {
    const newName = input.clientName?.trim() ?? '';
    const oldName = current.clientName?.trim() ?? '';
    if (newName.toLowerCase() !== oldName.toLowerCase()) {
      data.clientId = newName
        ? await resolveClientId(current.organizationId, newName)
        : null;
    }
  }
  return prisma.incomeRecord.update({ where: { id }, data });
}

export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true, organizationId: true, documentKind: true, netAmount: true },
  });
  if (!rec) throw notFound('Ingreso no encontrado');
  if (rec.documentKind === 'CREDIT_NOTE') {
    throw badRequest('Una nota de crédito no se cobra');
  }
  // netAmount === 0 = factura totalmente anulada por NC. netAmount null = ingreso
  // manual (no importado): es cobrable, por eso solo bloqueamos el 0 explícito.
  if (rec.netAmount === 0) {
    throw badRequest('Una factura anulada no se cobra');
  }

  if (input.bankTransactionId) {
    const mov = await prisma.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: { id: true, organizationId: true, creditAmount: true, transactionDate: true },
    });
    if (!mov) throw notFound('Movimiento no encontrado');
    if (mov.organizationId !== rec.organizationId) {
      throw badRequest('El movimiento no pertenece a la empresa del ingreso');
    }
    if (mov.creditAmount <= 0) {
      throw badRequest('El movimiento no es un abono');
    }
    return prisma.incomeRecord.update({
      where: { id },
      data: {
        paidByBankTransactionId: mov.id,
        paidDate: mov.transactionDate,
        status: 'PAID',
      },
    });
  }

  const paidDate = input.paidDate ?? null;
  return prisma.incomeRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'INVOICED',
      paidByBankTransactionId: null,
    },
  });
}

// Conciliación/pago en lote. Reusa las mismas guardas y semántica que
// registerPayment, pero para varias facturas en una sola escritura atómica
// (updateMany). Con bankTransactionId concilia N facturas ↔ 1 movimiento; con
// paidDate marca pagadas; con ambos en null revierte/desconcilia.
export async function bulkRegisterPayment(input: BulkRegisterPaymentInput) {
  const { ids, bankTransactionId, paidDate: inputPaidDate } = input;
  const recs = await prisma.incomeRecord.findMany({
    where: { id: { in: ids } },
    select: { id: true, organizationId: true, documentKind: true, netAmount: true },
  });
  if (recs.length !== ids.length) throw notFound('Alguna factura no fue encontrada');

  const orgIds = new Set(recs.map((r) => r.organizationId));
  if (orgIds.size > 1) {
    throw badRequest('Las facturas seleccionadas deben ser de la misma empresa');
  }
  for (const r of recs) {
    if (r.documentKind === 'CREDIT_NOTE') {
      throw badRequest('La selección incluye una nota de crédito, que no se cobra');
    }
    if (r.netAmount === 0) {
      throw badRequest('La selección incluye una factura anulada, que no se cobra');
    }
  }

  if (bankTransactionId) {
    const mov = await prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      select: { id: true, organizationId: true, creditAmount: true, transactionDate: true },
    });
    if (!mov) throw notFound('Movimiento no encontrado');
    if (mov.organizationId !== recs[0].organizationId) {
      throw badRequest('El movimiento no pertenece a la empresa de las facturas');
    }
    if (mov.creditAmount <= 0) throw badRequest('El movimiento no es un abono');
    await prisma.incomeRecord.updateMany({
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
  await prisma.incomeRecord.updateMany({
    where: { id: { in: ids } },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'INVOICED',
      paidByBankTransactionId: null,
    },
  });
  return { count: ids.length };
}

export async function remove(id: string) {
  const exists = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Ingreso no encontrado');
  await prisma.incomeRecord.delete({ where: { id } });
}

/// Meses (YYYY-MM) que tienen ingresos, ordenados descendente. Alimenta el
/// desplegable de filtro por mes (solo ofrece meses con datos).
export async function listMonths(organizationId?: string): Promise<string[]> {
  return ledgerListMonths('income', organizationId);
}
