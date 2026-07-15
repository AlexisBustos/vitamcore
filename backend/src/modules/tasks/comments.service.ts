import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { CreateCommentInput } from './comments.schema';
import type { AuthUser } from '../../middleware/auth';
import { assertTaskVisible } from '../shared/visibility';

const withAuthor = {
  include: { author: { select: { id: true, name: true } } },
} as const;

export async function list(taskId: string, user?: AuthUser) {
  await assertTaskVisible(taskId, user);
  return prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    ...withAuthor,
  });
}

export async function create(
  taskId: string,
  input: CreateCommentInput,
  authorId: string,
  user?: AuthUser,
) {
  await assertTaskVisible(taskId, user);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!task) throw notFound('Tarea no encontrada');
  return prisma.taskComment.create({
    data: { taskId, authorId, body: input.body },
    ...withAuthor,
  });
}
