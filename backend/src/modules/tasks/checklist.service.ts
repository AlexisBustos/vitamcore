/**
 * Ítems de checklist de una tarea. Orden por `position` (0-based).
 */
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { CreateChecklistItemInput, UpdateChecklistItemInput } from './checklist.schema';
import type { AuthUser } from '../../middleware/auth';
import { assertTaskVisible } from '../shared/visibility';

export function listByTask(taskId: string) {
  return prisma.checklistItem.findMany({
    where: { taskId },
    orderBy: { position: 'asc' },
  });
}

export async function addItem(
  taskId: string,
  input: CreateChecklistItemInput,
  user?: AuthUser,
) {
  await assertTaskVisible(taskId, user);
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw notFound('Tarea no encontrada');
  const last = await prisma.checklistItem.findFirst({
    where: { taskId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const position = last ? last.position + 1 : 0;
  return prisma.checklistItem.create({ data: { taskId, text: input.text, position } });
}

export async function updateItem(
  taskId: string,
  itemId: string,
  input: UpdateChecklistItemInput,
  user?: AuthUser,
) {
  await assertTaskVisible(taskId, user);
  await assertItemInTask(taskId, itemId);
  return prisma.checklistItem.update({ where: { id: itemId }, data: input });
}

export async function removeItem(taskId: string, itemId: string, user?: AuthUser) {
  await assertTaskVisible(taskId, user);
  await assertItemInTask(taskId, itemId);
  await prisma.checklistItem.delete({ where: { id: itemId } });
}

async function assertItemInTask(taskId: string, itemId: string) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { taskId: true },
  });
  if (!item || item.taskId !== taskId) throw notFound('Ítem de checklist no encontrado');
}
