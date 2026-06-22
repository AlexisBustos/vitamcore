/**
 * Lógica de negocio de oportunidades comerciales.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
  CreateSalesInput,
  ListSalesFilters,
  UpdateSalesInput,
} from './sales.schema';

const refs = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

export const OPEN_SALES_STATUSES = [
  'LEAD',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'DIAGNOSIS_DONE',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'PAUSED',
] as const;

export async function list(filters: ListSalesFilters) {
  const where: Prisma.SalesOpportunityWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    status: filters.status,
  };

  if (filters.productOrService) {
    where.productOrService = {
      contains: filters.productOrService,
      mode: 'insensitive',
    };
  }
  if (filters.minProbability !== undefined) {
    where.probability = { gte: filters.minProbability };
  }
  if (filters.noFollowUp) {
    where.nextFollowUpDate = null;
    where.status = { in: [...OPEN_SALES_STATUSES] };
  }

  return prisma.salesOpportunity.findMany({
    where,
    orderBy: [{ nextFollowUpDate: 'asc' }, { updatedAt: 'desc' }],
    include: refs,
  });
}

export async function getById(id: string) {
  const opp = await prisma.salesOpportunity.findUnique({
    where: { id },
    include: refs,
  });
  if (!opp) throw notFound('Oportunidad no encontrada');
  return opp;
}

export async function create(input: CreateSalesInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.salesOpportunity.create({ data: input });
}

export async function update(id: string, input: UpdateSalesInput) {
  const current = await prisma.salesOpportunity.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Oportunidad no encontrada');
  await assertContext(
    current.organizationId,
    input.businessUnitId,
    input.projectId,
  );
  return prisma.salesOpportunity.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  const exists = await prisma.salesOpportunity.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Oportunidad no encontrada');
  await prisma.salesOpportunity.delete({ where: { id } });
}

/** Resumen del pipeline comercial (reutilizado por dashboard y página Ventas). */
export async function getSummary(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};
  const now = new Date();
  const openWhere: Prisma.SalesOpportunityWhereInput = {
    ...orgFilter,
    status: { in: [...OPEN_SALES_STATUSES] },
  };

  const [
    openCount,
    wonCount,
    lostCount,
    openAgg,
    openList,
    noFollowUpCount,
    statusGroups,
    upcomingFollowUps,
  ] = await Promise.all([
    prisma.salesOpportunity.count({ where: openWhere }),
    prisma.salesOpportunity.count({ where: { ...orgFilter, status: 'WON' } }),
    prisma.salesOpportunity.count({ where: { ...orgFilter, status: 'LOST' } }),
    prisma.salesOpportunity.aggregate({
      _sum: { estimatedAmount: true },
      where: openWhere,
    }),
    // Para el monto ponderado necesitamos monto y probabilidad de cada abierta.
    prisma.salesOpportunity.findMany({
      where: openWhere,
      select: { estimatedAmount: true, probability: true },
    }),
    prisma.salesOpportunity.count({
      where: {
        ...orgFilter,
        status: { in: [...OPEN_SALES_STATUSES] },
        OR: [{ nextFollowUpDate: null }, { nextFollowUpDate: { lt: now } }],
      },
    }),
    prisma.salesOpportunity.groupBy({
      by: ['status'],
      where: orgFilter,
      _count: { _all: true },
    }),
    prisma.salesOpportunity.findMany({
      where: {
        ...orgFilter,
        status: { in: [...OPEN_SALES_STATUSES] },
        nextFollowUpDate: { gte: now },
      },
      orderBy: { nextFollowUpDate: 'asc' },
      take: 6,
      include: refs,
    }),
  ]);

  const weightedAmount = openList.reduce(
    (acc, o) => acc + Math.round((o.estimatedAmount * o.probability) / 100),
    0,
  );

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count._all;

  return {
    openCount,
    wonCount,
    lostCount,
    openAmount: openAgg._sum.estimatedAmount ?? 0,
    weightedAmount,
    noFollowUpCount,
    byStatus,
    upcomingFollowUps,
  };
}
