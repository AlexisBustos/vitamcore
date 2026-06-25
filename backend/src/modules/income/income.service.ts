/**
 * Lógica de negocio de ingresos (IncomeRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
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
    where.netAmount = { gt: 0 };
  } else if (filters.paymentState === 'overdue') {
    excludeNC();
    where.paidDate = null;
    where.netAmount = { gt: 0 };
    const now = new Date();
    where.dueDate = { lt: now };
  } else if (filters.paymentState === 'paid') {
    where.paidDate = { not: null };
  } else if (filters.paymentState === 'cancelled') {
    where.netAmount = 0;
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
  return prisma.incomeRecord.create({ data: input });
}

export async function update(id: string, input: UpdateIncomeInput) {
  const current = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Ingreso no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.incomeRecord.update({ where: { id }, data: input });
}

export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true, documentKind: true, netAmount: true },
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
  // Normaliza undefined → null para que un body sin paidDate revierta el cobro.
  const paidDate = input.paidDate ?? null;
  return prisma.incomeRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'INVOICED',
    },
  });
}

export async function remove(id: string) {
  const exists = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Ingreso no encontrado');
  await prisma.incomeRecord.delete({ where: { id } });
}
