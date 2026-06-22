/**
 * Lógica de negocio de decisiones estratégicas (StrategicDecision).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
  CreateDecisionInput,
  ListDecisionsFilters,
  UpdateDecisionInput,
} from './decisions.schema';

const refs = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

export async function list(filters: ListDecisionsFilters) {
  const where: Prisma.StrategicDecisionWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    status: filters.status,
  };

  return prisma.strategicDecision.findMany({
    where,
    orderBy: [{ decisionDate: 'desc' }, { createdAt: 'desc' }],
    include: refs,
  });
}

export async function getById(id: string) {
  const dec = await prisma.strategicDecision.findUnique({
    where: { id },
    include: refs,
  });
  if (!dec) throw notFound('Decisión no encontrada');
  return dec;
}

export async function create(input: CreateDecisionInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.strategicDecision.create({ data: input });
}

export async function update(id: string, input: UpdateDecisionInput) {
  const current = await prisma.strategicDecision.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Decisión no encontrada');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.strategicDecision.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  const exists = await prisma.strategicDecision.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Decisión no encontrada');
  await prisma.strategicDecision.delete({ where: { id } });
}
