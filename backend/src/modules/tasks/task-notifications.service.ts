/**
 * Notificaciones por correo de asignación de tareas.
 *
 * Dos unidades: `buildAssignmentEmail` (pura, arma el contenido) y
 * `notifyTaskAssigned` (carga destinatarios y envía). El envío NUNCA rompe ni
 * revierte la asignación: `notifyTaskAssigned` captura sus propios errores.
 */
import type { Priority } from '@prisma/client';
import { env } from '../../config/env';

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

/// Fecha 'DD-MM-YYYY' de una fecha de calendario UTC.
function fechaLegible(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getUTCFullYear()}`;
}

export type AssignmentEmailInput = {
  recipientName: string;
  taskTitle: string;
  taskId: string;
  description?: string | null;
  organizationName?: string | null;
  projectName?: string | null;
  priority: Priority;
  dueDate?: Date | null;
  assignedByName?: string | null;
};

/** Arma asunto, HTML y texto plano del correo de asignación de un destinatario. */
export function buildAssignmentEmail(input: AssignmentEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const url = `${env.APP_URL}/tareas?tarea=${input.taskId}`;
  const contexto = [input.organizationName, input.projectName]
    .filter(Boolean)
    .join(' · ');

  const lineasHtml: string[] = [
    `<p>Hola ${input.recipientName},</p>`,
    `<p>Se te asignó una nueva tarea:</p>`,
    `<h2 style="margin:8px 0">${input.taskTitle}</h2>`,
  ];
  if (input.description) lineasHtml.push(`<p>${input.description}</p>`);
  if (contexto) lineasHtml.push(`<p><strong>Contexto:</strong> ${contexto}</p>`);
  lineasHtml.push(`<p><strong>Prioridad:</strong> ${PRIORITY_LABEL[input.priority]}</p>`);
  if (input.dueDate) {
    lineasHtml.push(`<p><strong>Vence:</strong> ${fechaLegible(input.dueDate)}</p>`);
  }
  if (input.assignedByName) {
    lineasHtml.push(`<p><strong>Asignada por:</strong> ${input.assignedByName}</p>`);
  }
  lineasHtml.push(
    `<p style="margin-top:16px">
       <a href="${url}"
          style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
         Abrir tarea
       </a>
     </p>`,
  );

  const lineasTexto: string[] = [
    `Hola ${input.recipientName},`,
    ``,
    `Se te asignó una nueva tarea: ${input.taskTitle}`,
  ];
  if (input.description) lineasTexto.push(input.description);
  if (contexto) lineasTexto.push(`Contexto: ${contexto}`);
  lineasTexto.push(`Prioridad: ${PRIORITY_LABEL[input.priority]}`);
  if (input.dueDate) lineasTexto.push(`Vence: ${fechaLegible(input.dueDate)}`);
  if (input.assignedByName) lineasTexto.push(`Asignada por: ${input.assignedByName}`);
  lineasTexto.push(``, `Abrir tarea: ${url}`);

  return {
    subject: `Nueva tarea asignada: ${input.taskTitle}`,
    html: lineasHtml.join('\n'),
    text: lineasTexto.join('\n'),
  };
}
