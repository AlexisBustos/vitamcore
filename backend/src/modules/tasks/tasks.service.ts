/**
 * Lógica de negocio de tareas (Task).
 */
import { Prisma, TaskActivityType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import {
  assertAssignableUsers,
  assertBusinessUnitInOrganization,
  assertLabelsInOrganization,
  assertOrganization,
  assertProjectInOrganization,
} from '../shared/relations';
import {
  assertProjectVisible,
  isRestrictedUser,
  projectVisibilityWhere,
} from '../shared/visibility';
import { syncProjectStatus } from '../projects/projects.service';
import {
  diffScalarEvents,
  recordActivity,
  type ActivityEvent,
} from './task-activity.service';
import { notifyTaskAssigned } from './task-notifications.service';
import type {
  CreateTaskInput,
  ListTasksFilters,
  UpdateTaskInput,
} from './tasks.schema';

// Estado que cuenta como "cerrado" para el cálculo de vencidas.
const OPEN_STATUSES: Prisma.TaskWhereInput['status'] = {
  not: 'DONE',
};

export async function list(filters: ListTasksFilters, user?: AuthUser) {
  const where: Prisma.TaskWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    status: filters.status,
    priority: filters.priority,
  };

  if (filters.assigneeId) {
    where.assignees = { some: { userId: filters.assigneeId } };
  }

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

  // Visibilidad row-level (colaboradores): la tarea es visible si no tiene
  // proyecto o si su proyecto es visible. En AND para no pisar el OR de búsqueda.
  if (isRestrictedUser(user)) {
    where.AND = [
      { OR: [{ projectId: null }, { project: projectVisibilityWhere(user.id) }] },
    ];
  }

  return prisma.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
      labels: { include: { label: true } },
      checklistItems: { select: { done: true } },
    },
  });
}

export async function getById(id: string, user?: AuthUser) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
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
  if (task.projectId) await assertProjectVisible(task.projectId, user);
  return task;
}

export async function create(input: CreateTaskInput, user?: AuthUser) {
  await assertOrganization(input.organizationId);
  // La visibilidad va ANTES de assertRelations: para un colaborador, un
  // proyecto oculto y uno inexistente deben dar el mismo 404 "Proyecto no
  // encontrado" (no-enumeración). Coherente con el orden en update().
  if (input.projectId) await assertProjectVisible(input.projectId, user);
  await assertRelations(input.organizationId, input.businessUnitId, input.projectId);
  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  await assertAssignableUsers(assigneeIds);
  const { labelIds, assigneeIds: _ignore, ...data } = input;
  if (labelIds?.length) {
    await assertLabelsInOrganization(labelIds, input.organizationId);
  }
  // Las validaciones anteriores solo leen, así que pueden ir fuera de la
  // transacción. La escritura + la sincronización del proyecto van juntas.
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({ data });
    if (labelIds?.length) {
      await tx.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId: created.id, labelId })),
      });
    }
    if (assigneeIds.length) {
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: created.id, userId })),
      });
    }
    await recordActivity(tx, created.id, user?.id, [
      { type: TaskActivityType.CREATED, data: {} },
    ]);
    if (created.projectId) await syncProjectStatus(created.projectId, tx);
    return created;
  });
  // En create, todos los responsables son nuevos. Se notifica fuera de la
  // transacción; nunca lanza.
  await maybeNotifyAssigned(task, assigneeIds, user);
  return task;
}

export async function update(
  id: string,
  input: UpdateTaskInput,
  user?: AuthUser,
) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      status: true,
      dueDate: true,
      startDate: true,
      labels: { select: { labelId: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!current) throw notFound('Tarea no encontrada');

  // La tarea actual debe ser visible, y también el proyecto destino si se mueve.
  if (current.projectId) await assertProjectVisible(current.projectId, user);
  if (input.projectId) await assertProjectVisible(input.projectId, user);

  await assertRelations(
    current.organizationId,
    input.businessUnitId,
    input.projectId,
  );
  const assigneeIds = input.assigneeIds
    ? [...new Set(input.assigneeIds)]
    : undefined;
  if (assigneeIds) await assertAssignableUsers(assigneeIds);
  const { labelIds, assigneeIds: _ignore, ...data } = input;
  if (labelIds) {
    await assertLabelsInOrganization(labelIds, current.organizationId);
  }

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id }, data });
    // labelIds (si viene) reemplaza el set completo de etiquetas.
    if (labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } });
      if (labelIds.length) {
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({ taskId: id, labelId })),
        });
      }
    }
    // assigneeIds (si viene) reemplaza el set completo de responsables.
    if (assigneeIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      if (assigneeIds.length) {
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((userId) => ({ taskId: id, userId })),
        });
      }
    }
    await recordActivity(
      tx,
      id,
      user?.id,
      await buildUpdateEvents(tx, current, input, labelIds, assigneeIds),
    );
    // Si la tarea se movió de proyecto, hay que recalcular ambos.
    const affected = new Set<string>();
    if (current.projectId) affected.add(current.projectId);
    if (updated.projectId) affected.add(updated.projectId);
    for (const pid of affected) await syncProjectStatus(pid, tx);
    return updated;
  });
  // Notifica solo a los responsables NUEVOS (los que no estaban antes).
  const before = new Set(current.assignees.map((a) => a.userId));
  const nuevos = assigneeIds ? assigneeIds.filter((u) => !before.has(u)) : [];
  await maybeNotifyAssigned(task, nuevos, user);
  return task;
}

/**
 * Deriva los eventos de actividad de un update: cambios escalares
 * (estado, responsable, fechas, proyecto) más altas/bajas de etiquetas.
 */
async function buildUpdateEvents(
  tx: Prisma.TransactionClient,
  prev: {
    status: Prisma.TaskGetPayload<object>['status'];
    projectId: string | null;
    dueDate: Date | null;
    startDate: Date | null;
    labels: { labelId: string }[];
    assignees: { userId: string }[];
  },
  input: UpdateTaskInput,
  labelIds: string[] | undefined,
  assigneeIds: string[] | undefined,
): Promise<ActivityEvent[]> {
  const events = diffScalarEvents(prev, input);

  if (labelIds) {
    const before = new Set(prev.labels.map((l) => l.labelId));
    const after = new Set(labelIds);
    const added = labelIds.filter((l) => !before.has(l));
    const removed = [...before].filter((l) => !after.has(l));
    if (added.length || removed.length) {
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
    }
  }

  if (assigneeIds) {
    const before = new Set(prev.assignees.map((a) => a.userId));
    const after = new Set(assigneeIds);
    const added = assigneeIds.filter((u) => !before.has(u));
    const removed = [...before].filter((u) => !after.has(u));
    if (added.length || removed.length) {
      const names = new Map(
        (
          await tx.user.findMany({
            where: { id: { in: [...added, ...removed] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name]),
      );
      for (const userId of added) {
        events.push({
          type: TaskActivityType.ASSIGNEE_ADDED,
          data: { userId, name: names.get(userId) ?? null },
        });
      }
      for (const userId of removed) {
        events.push({
          type: TaskActivityType.ASSIGNEE_REMOVED,
          data: { userId, name: names.get(userId) ?? null },
        });
      }
    }
  }

  return events;
}

export async function remove(id: string, user?: AuthUser) {
  const existing = await prisma.task.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw notFound('Tarea no encontrada');
  if (existing.projectId) await assertProjectVisible(existing.projectId, user);
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id } });
    if (existing.projectId) await syncProjectStatus(existing.projectId, tx);
  });
}

/**
 * Carga nombres de empresa/proyecto y notifica por correo a los responsables
 * nuevos. Se llama SIEMPRE fuera de la transacción; nunca lanza.
 */
async function maybeNotifyAssigned(
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: Prisma.TaskGetPayload<object>['priority'];
    dueDate: Date | null;
    organizationId: string;
    projectId: string | null;
  },
  recipientIds: string[],
  user?: AuthUser,
) {
  if (recipientIds.length === 0) return;
  const [organization, project] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: task.organizationId },
      select: { name: true },
    }),
    task.projectId
      ? prisma.project.findUnique({
          where: { id: task.projectId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  await notifyTaskAssigned({
    task,
    organizationName: organization?.name ?? null,
    projectName: project?.name ?? null,
    recipientIds,
    actorId: user?.id,
    actorName: user?.name ?? null,
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
