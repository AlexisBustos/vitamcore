/**
 * Lógica de negocio de tareas (Task).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import {
  assertBusinessUnitInOrganization,
  assertOrganization,
  assertProjectInOrganization,
} from '../shared/relations';
import type {
  CreateTaskInput,
  ListTasksFilters,
  UpdateTaskInput,
} from './tasks.schema';

// Estados que cuentan como "abiertos" para el cálculo de vencidas.
const OPEN_STATUSES: Prisma.TaskWhereInput['status'] = {
  notIn: ['COMPLETED', 'CANCELLED'],
};

export async function list(filters: ListTasksFilters) {
  const where: Prisma.TaskWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    status: filters.status,
    priority: filters.priority,
  };

  if (filters.overdue) {
    where.dueDate = { lt: new Date() };
    where.status = OPEN_STATUSES;
  }

  return prisma.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
}

export async function getById(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!task) throw notFound('Tarea no encontrada');
  return task;
}

export async function create(input: CreateTaskInput) {
  await assertOrganization(input.organizationId);
  await assertRelations(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.task.create({ data: input });
}

export async function update(id: string, input: UpdateTaskInput) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!current) throw notFound('Tarea no encontrada');

  await assertRelations(
    current.organizationId,
    input.businessUnitId,
    input.projectId,
  );

  return prisma.task.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Tarea no encontrada');
  await prisma.task.delete({ where: { id } });
}

/** Valida que unidad y proyecto (si vienen) pertenezcan a la empresa. */
async function assertRelations(
  organizationId: string,
  businessUnitId?: string | null,
  projectId?: string | null,
) {
  if (businessUnitId) {
    await assertBusinessUnitInOrganization(businessUnitId, organizationId);
  }
  if (projectId) {
    await assertProjectInOrganization(projectId, organizationId);
  }
}
