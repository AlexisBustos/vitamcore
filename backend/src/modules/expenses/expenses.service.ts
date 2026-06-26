/**
 * Lógica de negocio de gastos (ExpenseRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
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

// Estados de un gasto aún por pagar.
const PAYABLE_STATUSES = ['PENDING', 'OVERDUE'] as const;

// Invariante: el estado PAID solo es válido con fecha de pago. El paso a pagado se
// hace a mano vía registerPayment; el formulario no fija paidDate, así que un PAID
// sin paidDate se degrada a PENDING.
function normalizePaidStatus<T extends { status?: string | null }>(
  input: T,
  paidDate: Date | null,
): T {
  if (input.status === 'PAID' && !paidDate) {
    return { ...input, status: 'PENDING' };
  }
  return input;
}

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
    where.status = { in: [...PAYABLE_STATUSES] };
  } else if (filters.paymentState === 'overdue') {
    where.paidDate = null;
    where.status = { in: [...PAYABLE_STATUSES] };
    where.dueDate = { lt: new Date() };
  } else if (filters.paymentState === 'paid') {
    where.paidDate = { not: null };
    where.status = { not: 'CANCELLED' };
  } else if (filters.paymentState === 'cancelled') {
    where.status = 'CANCELLED';
  }

  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    where.expenseDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
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
  // create nunca recibe paidDate (no está en el schema): un PAID se degrada a PENDING.
  return prisma.expenseRecord.create({ data: normalizePaidStatus(input, null) });
}

export async function update(id: string, input: UpdateExpenseInput) {
  const current = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { organizationId: true, paidDate: true },
  });
  if (!current) throw notFound('Gasto no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.expenseRecord.update({
    where: { id },
    data: normalizePaidStatus(input, current.paidDate),
  });
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
    select: { id: true, status: true },
  });
  if (!rec) throw notFound('Gasto no encontrado');
  if (rec.status === 'CANCELLED') throw badRequest('Un gasto anulado no se paga');
  const paidDate = input.paidDate ?? null;
  return prisma.expenseRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'PENDING',
    },
  });
}

/// Meses (YYYY-MM) que tienen gastos, ordenados descendente. Alimenta el filtro por mes.
export async function listMonths(organizationId?: string): Promise<string[]> {
  const orgClause = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('month', "expenseDate"), 'YYYY-MM') AS mes
    FROM "expense_records"
    WHERE "expenseDate" IS NOT NULL ${orgClause}
    ORDER BY mes DESC
  `);
  return rows.map((r) => r.mes);
}
