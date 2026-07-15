/**
 * Lógica de negocio de proyectos (Project).
 */
import { Prisma } from '@prisma/client';
import type { ProjectStatus, TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import {
  assertAssignableUser,
  assertBusinessUnitInOrganization,
  assertOrganization,
} from '../shared/relations';
import type { AuthUser } from '../../middleware/auth';
import {
  assertProjectVisible,
  isRestrictedUser,
  projectVisibilityWhere,
} from '../shared/visibility';
import type {
  CreateProjectInput,
  ListProjectsFilters,
  UpdateProjectInput,
} from './projects.schema';

// Estados del "camino feliz" que la automatización puede gestionar.
// Los demás (BLOCKED, PAUSED, CANCELLED, IN_REVIEW) son decisiones manuales
// y nunca se tocan automáticamente.
const STATUS_AUTO: ProjectStatus[] = [
  'IDEA',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
];

export async function list(filters: ListProjectsFilters, user?: AuthUser) {
  const where: Prisma.ProjectWhereInput = {
    organizationId: filters.organizationId,
    ownerId: filters.ownerId,
    businessUnitId: filters.businessUnitId,
    status: filters.status,
    priority: filters.priority,
  };
  // Visibilidad row-level: solo restringe a colaboradores. Va en AND para
  // no colisionar con otros OR (convención de shared/visibility.ts).
  if (isRestrictedUser(user)) {
    where.AND = [projectVisibilityWhere(user.id)];
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tasks: true } },
    },
  });

  if (projects.length === 0) return [];

  // Desglose de tareas por proyecto/estado para calcular el avance (done/total).
  const grouped = await prisma.task.groupBy({
    by: ['projectId', 'status'],
    where: { projectId: { in: projects.map((p) => p.id) } },
    _count: { _all: true },
  });

  return projects.map((project) => {
    const stats = grouped.filter((g) => g.projectId === project.id);
    const total = stats.reduce((sum, g) => sum + g._count._all, 0);
    const done =
      stats.find((g) => g.status === 'DONE')?._count._all ?? 0;
    return { ...project, taskStats: { total, done } };
  });
}

export async function getById(id: string, user?: AuthUser) {
  await assertProjectVisible(id, user);
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      tasks: {
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        include: {
          assignees: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!project) throw notFound('Proyecto no encontrado');
  return project;
}

export async function create(input: CreateProjectInput) {
  await assertOrganization(input.organizationId);
  if (input.businessUnitId) {
    await assertBusinessUnitInOrganization(
      input.businessUnitId,
      input.organizationId,
    );
  }
  await assertAssignableUser(input.ownerId);
  try {
    return await prisma.project.create({ data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function update(id: string, input: UpdateProjectInput) {
  const current = await prisma.project.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!current) throw notFound('Proyecto no encontrado');

  // Si se cambia la unidad, debe pertenecer a la empresa del proyecto.
  if (input.businessUnitId) {
    await assertBusinessUnitInOrganization(
      input.businessUnitId,
      current.organizationId,
    );
  }
  await assertAssignableUser(input.ownerId);

  try {
    return await prisma.project.update({ where: { id }, data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function remove(id: string) {
  const exists = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Proyecto no encontrado');
  // Las tareas asociadas quedan con projectId = null (SetNull).
  await prisma.project.delete({ where: { id } });
}

function handleUniqueError(err: unknown) {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return badRequest(
      'Ya existe un proyecto con ese nombre en la empresa',
    );
  }
  return err;
}

/**
 * Calcula el estado que "merece" un proyecto según el recuento de sus tareas
 * por estado. Devuelve `null` cuando no hay opinión (sin tareas o todas por
 * hacer): en ese caso la automatización no debe tocar el proyecto.
 */
function deriveStatus(
  grouped: { status: TaskStatus; _count: { _all: number } }[],
): ProjectStatus | null {
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  if (total === 0) return null; // sin tareas → sin opinión

  const done = grouped.find((g) => g.status === 'DONE')?._count._all ?? 0;
  if (done === total) return 'COMPLETED'; // todas hechas

  const todo = grouped.find((g) => g.status === 'TODO')?._count._all ?? 0;
  if (todo === total) return null; // todas por hacer → sin opinión

  return 'IN_PROGRESS'; // hay actividad (algún DOING, o DONE parcial)
}

/**
 * Sincroniza el estado del proyecto con el avance de sus tareas.
 * - Respeta los estados manuales: si el proyecto no está en STATUS_AUTO, no hace nada.
 * - Solo escribe si el estado derivado difiere del actual.
 * Es un efecto secundario best-effort: si el proyecto no existe, retorna en silencio.
 *
 * Acepta un cliente transaccional para ejecutarse dentro de la misma transacción
 * que la mutación de tarea que lo dispara (así el groupBy ve la escritura reciente).
 */
export async function syncProjectStatus(
  projectId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  const project = await client.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
  });
  if (!project) return;
  if (!STATUS_AUTO.includes(project.status)) return;

  const grouped = await client.task.groupBy({
    by: ['status'],
    where: { projectId },
    _count: { _all: true },
  });

  const derived = deriveStatus(grouped);
  if (!derived || derived === project.status) return;

  await client.project.update({
    where: { id: projectId },
    data: { status: derived },
  });
}
