/**
 * Lógica de negocio de ingresos (IncomeRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
  CreateIncomeInput,
  ListIncomeFilters,
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

export async function remove(id: string) {
  const exists = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Ingreso no encontrado');
  await prisma.incomeRecord.delete({ where: { id } });
}
