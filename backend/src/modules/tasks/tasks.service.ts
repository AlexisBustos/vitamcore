/**
 * Lógica de negocio de tareas (Task).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import {
  assertAssignableUser,
  assertBusinessUnitInOrganization,
  assertLabelsInOrganization,
  assertOrganization,
  assertProjectInOrganization,
} from '../shared/relations';
import { syncProjectStatus } from '../projects/projects.service';
import type {
  CreateTaskInput,
  ListTasksFilters,
  UpdateTaskInput,
} from './tasks.schema';

// Estado que cuenta como "cerrado" para el cálculo de vencidas.
const OPEN_STATUSES: Prisma.TaskWhereInput['status'] = {
  not: 'DONE',
};

export async function list(filters: ListTasksFilters) {
  const where: Prisma.TaskWhereInput = {
    organizationId: filters.organizationId,
    ownerId: filters.ownerId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    status: filters.status,
    priority: filters.priority,
  };

  if (filters.overdue) {
    where.dueDate = { lt: new Date() };
    where.status = OPEN_STATUSES;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      labels: { include: { label: true } },
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
      owner: { select: { id: true, name: true } },
      labels: { include: { label: true } },
    },
  });
  if (!task) throw notFound('Tarea no encontrada');
  return task;
}

export async function create(input: CreateTaskInput) {
  await assertOrganization(input.organizationId);
  await assertRelations(input.organizationId, input.businessUnitId, input.projectId);
  await assertAssignableUser(input.ownerId);
  const { labelIds, ...data } = input;
  if (labelIds?.length) {
    await assertLabelsInOrganization(labelIds, input.organizationId);
  }
  // Las validaciones anteriores solo leen, así que pueden ir fuera de la
  // transacción. La escritura + la sincronización del proyecto van juntas.
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data });
    if (labelIds?.length) {
      await tx.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId: task.id, labelId })),
      });
    }
    if (task.projectId) await syncProjectStatus(task.projectId, tx);
    return task;
  });
}

export async function update(id: string, input: UpdateTaskInput) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: { id: true, organizationId: true, projectId: true },
  });
  if (!current) throw notFound('Tarea no encontrada');

  await assertRelations(
    current.organizationId,
    input.businessUnitId,
    input.projectId,
  );
  await assertAssignableUser(input.ownerId);
  const { labelIds, ...data } = input;
  if (labelIds) {
    await assertLabelsInOrganization(labelIds, current.organizationId);
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id }, data });
    // labelIds (si viene) reemplaza el set completo de etiquetas.
    if (labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } });
      if (labelIds.length) {
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({ taskId: id, labelId })),
        });
      }
    }
    // Si la tarea se movió de proyecto, hay que recalcular ambos.
    const affected = new Set<string>();
    if (current.projectId) affected.add(current.projectId);
    if (task.projectId) affected.add(task.projectId);
    for (const pid of affected) await syncProjectStatus(pid, tx);
    return task;
  });
}

export async function remove(id: string) {
  const existing = await prisma.task.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw notFound('Tarea no encontrada');
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id } });
    if (existing.projectId) await syncProjectStatus(existing.projectId, tx);
  });
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
