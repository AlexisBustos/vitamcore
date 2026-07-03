import { taskStatus } from '@/lib/domain';
import type { TaskActivity, TaskStatus } from '@/types/domain';

/** Texto legible en español para una línea de actividad del historial. */
export function activityText(a: TaskActivity): string {
  const d = a.data ?? {};
  switch (a.type) {
    case 'CREATED':
      return 'creó la tarea';
    case 'STATUS_CHANGED': {
      const to = (d.to as TaskStatus) ?? undefined;
      return to ? `cambió el estado a ${taskStatus[to]?.label ?? to}` : 'cambió el estado';
    }
    case 'ASSIGNED':
      return 'cambió el responsable';
    case 'DUE_DATE_CHANGED':
      return 'cambió el vencimiento';
    case 'START_DATE_CHANGED':
      return 'cambió la fecha de inicio';
    case 'LABEL_ADDED':
      return `añadió la etiqueta “${d.name ?? ''}”`;
    case 'LABEL_REMOVED':
      return `quitó la etiqueta “${d.name ?? ''}”`;
    case 'MOVED_PROJECT':
      return 'movió la tarea de proyecto';
    default:
      return 'actualizó la tarea';
  }
}
