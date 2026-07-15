/**
 * Visibilidad row-level de proyectos (y sus tareas).
 * Regla (spec docs/superpowers/specs/2026-07-15-visibilidad-proyectos-design.md):
 * CEO/ADMIN ven todo; un COLABORADOR ve un proyecto si es público (sin
 * miembros), está en la lista de miembros, tiene una tarea asignada en él
 * o es su responsable. Una tarea es visible si su proyecto lo es (o no tiene).
 *
 * Los services componen `projectVisibilityWhere` SIEMPRE dentro de
 * `where.AND` para no colisionar con otros `OR` (p. ej. la búsqueda por
 * texto de tareas usa `where.OR`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import { isAdminRole } from './roles';

/** True si al usuario hay que aplicarle filtrado de visibilidad (colaborador). */
export function isRestrictedUser(user?: AuthUser | null): user is AuthUser {
  return !!user && !isAdminRole(user.role);
}

/** Fragmento `where` con la condición de visibilidad de proyectos para un usuario. */
export function projectVisibilityWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { members: { none: {} } }, // público
      { members: { some: { userId } } }, // en la lista
      { tasks: { some: { assignees: { some: { userId } } } } }, // tarea asignada
      { ownerId: userId }, // responsable
    ],
  };
}

/**
 * 404 si el proyecto no existe o no es visible para el usuario.
 * Mismo mensaje que "no existe": no se revela la existencia de lo oculto.
 * Para CEO/ADMIN no hace nada (ni siquiera consulta).
 */
export async function assertProjectVisible(
  projectId: string,
  user?: AuthUser | null,
) {
  if (!isRestrictedUser(user)) return;
  const found = await prisma.project.findFirst({
    where: { id: projectId, AND: [projectVisibilityWhere(user.id)] },
    select: { id: true },
  });
  if (!found) throw notFound('Proyecto no encontrado');
}

/**
 * 404 si la tarea no existe o pertenece a un proyecto no visible.
 * Para CEO/ADMIN no hace nada: el llamador conserva su propio check de existencia.
 */
export async function assertTaskVisible(taskId: string, user?: AuthUser | null) {
  if (!isRestrictedUser(user)) return;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) throw notFound('Tarea no encontrada');
  if (task.projectId) await assertProjectVisible(task.projectId, user);
}
