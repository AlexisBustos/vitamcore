import { Prisma, TaskActivityType } from '@prisma/client';
import type { TaskStatus } from '@prisma/client';

export type ActivityEvent = { type: TaskActivityType; data?: Prisma.InputJsonValue };

type ScalarState = {
  status: TaskStatus;
  ownerId: string | null;
  projectId: string | null;
  dueDate: Date | null;
  startDate: Date | null;
};

function sameTime(a: Date | null | undefined, b: Date | null | undefined) {
  return (a ? a.getTime() : null) === (b ? b.getTime() : null);
}

/**
 * Compara el estado previo con los campos enviados en un update y devuelve
 * los eventos de actividad que corresponden. Solo mira los campos presentes
 * en `input` (partial): un campo ausente nunca genera evento.
 */
export function diffScalarEvents(prev: ScalarState, input: Partial<ScalarState>): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  if ('status' in input && input.status !== undefined && input.status !== prev.status) {
    events.push({ type: TaskActivityType.STATUS_CHANGED, data: { from: prev.status, to: input.status } });
  }
  if ('ownerId' in input && (input.ownerId ?? null) !== prev.ownerId) {
    events.push({ type: TaskActivityType.ASSIGNED, data: {} });
  }
  if ('projectId' in input && (input.projectId ?? null) !== prev.projectId) {
    events.push({ type: TaskActivityType.MOVED_PROJECT, data: {} });
  }
  if ('dueDate' in input && !sameTime(input.dueDate, prev.dueDate)) {
    events.push({ type: TaskActivityType.DUE_DATE_CHANGED, data: {} });
  }
  if ('startDate' in input && !sameTime(input.startDate, prev.startDate)) {
    events.push({ type: TaskActivityType.START_DATE_CHANGED, data: {} });
  }
  return events;
}

/** Escribe los eventos de actividad dentro de la transacción dada. */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  taskId: string,
  actorId: string | null | undefined,
  events: ActivityEvent[],
) {
  if (events.length === 0) return;
  await tx.taskActivity.createMany({
    data: events.map((e) => ({
      taskId,
      actorId: actorId ?? null,
      type: e.type,
      data: e.data ?? Prisma.JsonNull,
    })),
  });
}
