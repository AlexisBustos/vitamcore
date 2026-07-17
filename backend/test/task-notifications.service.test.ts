import { describe, expect, test } from 'vitest';
import { buildAssignmentEmail } from '../src/modules/tasks/task-notifications.service';

describe('buildAssignmentEmail', () => {
  const base = {
    recipientName: 'Ana',
    taskTitle: 'Preparar informe',
    taskId: 't1',
    description: 'Detalle del informe',
    organizationName: 'Vitam Healthcare',
    projectName: 'Proyecto X',
    priority: 'HIGH' as const,
    dueDate: new Date('2026-07-20T00:00:00.000Z'),
    assignedByName: 'CEO VITAM',
  };

  test('asunto con el título de la tarea', () => {
    expect(buildAssignmentEmail(base).subject).toBe('Nueva tarea asignada: Preparar informe');
  });

  test('el enlace apunta al panel de la tarea (APP_URL + query tarea)', () => {
    const { html, text } = buildAssignmentEmail(base);
    expect(html).toContain('http://localhost:5173/tareas?tarea=t1');
    expect(text).toContain('http://localhost:5173/tareas?tarea=t1');
  });

  test('incluye saludo, prioridad legible y quién asignó', () => {
    const { html } = buildAssignmentEmail(base);
    expect(html).toContain('Ana');
    expect(html).toContain('Alta');
    expect(html).toContain('CEO VITAM');
  });

  test('omite la línea de vencimiento cuando no hay fecha', () => {
    const { html } = buildAssignmentEmail({ ...base, dueDate: null });
    expect(html).not.toContain('Vence');
  });

  test('el texto plano nunca va vacío (al menos título y enlace)', () => {
    const { text } = buildAssignmentEmail({ ...base, description: null });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Preparar informe');
  });
});
