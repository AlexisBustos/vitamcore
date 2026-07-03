import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { CreateCommentInput } from './comments.schema';

const withAuthor = {
  include: { author: { select: { id: true, name: true } } },
} as const;

export function list(taskId: string) {
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
) {
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
