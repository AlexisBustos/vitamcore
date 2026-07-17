import { describe, expect, test, vi, beforeEach, afterAll } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import {
  buildAssignmentEmail,
  notifyTaskAssigned,
} from '../src/modules/tasks/task-notifications.service';

// Mock del envío real: interceptamos sendEmail para no llamar a Resend.
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn() }));
import { sendEmail } from '../src/lib/email';
const sendEmailMock = vi.mocked(sendEmail);

beforeEach(async () => {
  await resetDb();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true, id: 'x' });
});
afterAll(disconnect);

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

const baseTask = {
  id: 't1',
  title: 'Preparar informe',
  description: null,
  priority: 'MEDIUM' as const,
  dueDate: null,
};

describe('notifyTaskAssigned', () => {
  test('excluye al actor: si el único responsable nuevo es quien asigna, no envía', async () => {
    const actor = await makeUser({ name: 'Actor', email: 'actor@vitam.tech' });
    await notifyTaskAssigned({
      task: baseTask,
      organizationName: 'Org',
      projectName: null,
      recipientIds: [actor.id],
      actorId: actor.id,
      actorName: actor.name,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test('envía un correo por cada responsable nuevo (excluyendo al actor)', async () => {
    const actor = await makeUser({ name: 'Actor', email: 'actor@vitam.tech' });
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });
    const luis = await makeUser({ name: 'Luis', email: 'luis@vitam.tech' });
    await notifyTaskAssigned({
      task: baseTask,
      organizationName: 'Org',
      projectName: null,
      recipientIds: [ana.id, luis.id, actor.id],
      actorId: actor.id,
      actorName: actor.name,
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const destinatarios = sendEmailMock.mock.calls.map((c) => c[0].to);
    expect(destinatarios).toEqual(
      expect.arrayContaining(['ana@vitam.tech', 'luis@vitam.tech']),
    );
  });

  test('un fallo enviando a uno NO impide enviar al resto ni propaga el error', async () => {
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });
    const luis = await makeUser({ name: 'Luis', email: 'luis@vitam.tech' });
    sendEmailMock.mockRejectedValueOnce(new Error('Resend 500'));
    await expect(
      notifyTaskAssigned({
        task: baseTask,
        organizationName: null,
        projectName: null,
        recipientIds: [ana.id, luis.id],
      }),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  test('sin responsables nuevos no consulta ni envía', async () => {
    await notifyTaskAssigned({
      task: baseTask,
      organizationName: null,
      projectName: null,
      recipientIds: [],
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
