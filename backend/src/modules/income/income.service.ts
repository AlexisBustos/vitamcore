/**
 * Lógica de negocio de ingresos (IncomeRecord).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import { resolveClientId } from '../shared/parties';
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

// Estados de un ingreso aún por cobrar (mismos que usa el resumen financiero).
const PENDING_STATUSES = ['EXPECTED', 'INVOICED', 'OVERDUE'] as const;

// "Saldo por cobrar" coherente con los KPIs de finance.service: usa netAmount
// cuando está calculado (ventas importadas) y, si no, cae al estado clásico
// (ingresos manuales o ventas legacy sin netAmount). Sin esto, el KPI y la
// pestaña de Cuentas por cobrar pueden descuadrar.
const RECEIVABLE_OR: Prisma.IncomeRecordWhereInput['OR'] = [
  { netAmount: { gt: 0 }, status: { not: 'CANCELLED' } },
  { netAmount: null, status: { in: [...PENDING_STATUSES] } },
];

// Invariante de cobranza: PAID ⇔ hay paidDate. El formulario no envía paidDate,
// así que reconciliamos el par (status, paidDate): al marcar PAID sin fecha le
// asignamos la fecha de cobro (hoy) y, al sacar de PAID, la limpiamos para no
// dejar un registro incoherente. El pago contra un movimiento bancario sigue
// pasando por registerPayment (fija además paidByBankTransactionId).
function reconcilePaidStatus<T extends { status?: string | null }>(
  input: T,
  currentPaidDate: Date | null,
): T & { paidDate?: Date | null; paidByBankTransactionId?: string | null } {
  // status undefined = el update no toca el estado; no tocamos la fecha de cobro.
  if (input.status === undefined) return input;
  if (input.status === 'PAID') {
    // Respeta la fecha de cobro existente; si no hay, marca cobrado hoy.
    return { ...input, paidDate: currentPaidDate ?? new Date() };
  }
  // Cualquier otro estado no es cobrado: limpia el rastro de cobro.
  return { ...input, paidDate: null, paidByBankTransactionId: null };
}

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
    const [y, m] = filters.month.split('-').map(Number);
    where.incomeDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)), // primer día del mes siguiente
    };
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
  const orgClause = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('month', "incomeDate"), 'YYYY-MM') AS mes
    FROM "income_records"
    WHERE "incomeDate" IS NOT NULL ${orgClause}
    ORDER BY mes DESC
  `);
  return rows.map((r) => r.mes);
}
