/**
 * Lógica de negocio de gastos (ExpenseRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
  CreateExpenseInput,
  ListExpenseFilters,
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
  return prisma.expenseRecord.create({ data: input });
}

export async function update(id: string, input: UpdateExpenseInput) {
  const current = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Gasto no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.expenseRecord.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  const exists = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Gasto no encontrado');
  await prisma.expenseRecord.delete({ where: { id } });
}
