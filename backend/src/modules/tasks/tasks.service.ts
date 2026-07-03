/**
 * Lógica de negocio de tareas (Task).
 */
import { Prisma, TaskActivityType } from '@prisma/client';
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
import {
  diffScalarEvents,
  recordActivity,
  type ActivityEvent,
} from './task-activity.service';
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
      checklistItems: { select: { done: true } },
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
      checklistItems: { orderBy: { position: 'asc' } },
      comments: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      activity: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!task) throw notFound('Tarea no encontrada');
  return task;
}

export async function create(input: CreateTaskInput, actorId?: string | null) {
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
    await recordActivity(tx, task.id, actorId, [
      { type: TaskActivityType.CREATED, data: {} },
    ]);
    if (task.projectId) await syncProjectStatus(task.projectId, tx);
    return task;
  });
}

export async function update(
  id: string,
  input: UpdateTaskInput,
  actorId?: string | null,
) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      status: true,
      ownerId: true,
      dueDate: true,
      startDate: true,
      labels: { select: { labelId: true } },
    },
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
    await recordActivity(
      tx,
      id,
      actorId,
      await buildUpdateEvents(tx, current, input, labelIds),
    );
    // Si la tarea se movió de proyecto, hay que recalcular ambos.
    const affected = new Set<string>();
    if (current.projectId) affected.add(current.projectId);
    if (task.projectId) affected.add(task.projectId);
    for (const pid of affected) await syncProjectStatus(pid, tx);
    return task;
  });
}

/**
 * Deriva los eventos de actividad de un update: cambios escalares
 * (estado, responsable, fechas, proyecto) más altas/bajas de etiquetas.
 */
async function buildUpdateEvents(
  tx: Prisma.TransactionClient,
  prev: {
    status: Prisma.TaskGetPayload<object>['status'];
    ownerId: string | null;
    projectId: string | null;
    dueDate: Date | null;
    startDate: Date | null;
    labels: { labelId: string }[];
  },
  input: UpdateTaskInput,
  labelIds: string[] | undefined,
): Promise<ActivityEvent[]> {
  const events = diffScalarEvents(prev, input);
  if (!labelIds) return events;

  const before = new Set(prev.labels.map((l) => l.labelId));
  const after = new Set(labelIds);
  const added = labelIds.filter((l) => !before.has(l));
  const removed = [...before].filter((l) => !after.has(l));
  if (added.length === 0 && removed.length === 0) return events;

  const names = new Map(
    (
      await tx.label.findMany({
        where: { id: { in: [...added, ...removed] } },
        select: { id: true, name: true },
      })
    ).map((l) => [l.id, l.name]),
  );
  for (const labelId of added) {
    events.push({
      type: TaskActivityType.LABEL_ADDED,
      data: { labelId, name: names.get(labelId) ?? null },
    });
  }
  for (const labelId of removed) {
    events.push({
      type: TaskActivityType.LABEL_REMOVED,
      data: { labelId, name: names.get(labelId) ?? null },
    });
  }
  return events;
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
