import { beforeEach, afterAll, describe, expect, test, vi } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser, asAuthUser } from './fixtures';
import * as tasks from '../src/modules/tasks/tasks.service';

vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn() }));
import { sendEmail } from '../src/lib/email';
const sendEmailMock = vi.mocked(sendEmail);

beforeEach(resetDb);
afterAll(disconnect);

describe('tasks — responsables (assignees)', () => {
  test('crea con varios responsables y los incluye al listar', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    await tasks.create({
      organizationId: org.id, title: 'Tarea con dueños',
      assigneeIds: [ana.id, beto.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    const names = list[0].assignees.map((a: { user: { name: string } }) => a.user.name).sort();
    expect(names).toEqual(['Ana', 'Beto']);
  });

  test('assigneeId inexistente => badRequest (400)', async () => {
    const org = await makeOrg();
    await expect(
      tasks.create({
        organizationId: org.id, title: 'X', assigneeIds: ['no-existe'],
        status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('ids duplicados no rompen (dedupe)', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    await tasks.create({
      organizationId: org.id, title: 'Dup', assigneeIds: [ana.id, ana.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list[0].assignees).toHaveLength(1);
  });

  test('update reemplaza el set completo de responsables', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    const created = await tasks.create({
      organizationId: org.id, title: 'T', assigneeIds: [ana.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    await tasks.update(created.id, { assigneeIds: [beto.id] } as never, undefined);
    const detail = await tasks.getById(created.id);
    const names = detail.assignees.map((a: { user: { name: string } }) => a.user.name);
    expect(names).toEqual(['Beto']);
  });

  test('filtra por assigneeId', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    await tasks.create({ organizationId: org.id, title: 'De Ana', assigneeIds: [ana.id], status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    await tasks.create({ organizationId: org.id, title: 'De Beto', assigneeIds: [beto.id], status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const soloAna = await tasks.list({ assigneeId: ana.id } as never);
    expect(soloAna).toHaveLength(1);
    expect(soloAna[0].title).toBe('De Ana');
  });

  test('listar sin assigneeId incluye tareas sin responsable', async () => {
    const org = await makeOrg();
    await tasks.create({ organizationId: org.id, title: 'Sin dueño', status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list).toHaveLength(1);
    expect(list[0].assignees).toHaveLength(0);
  });

  test('altas/bajas de responsables generan actividad', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    const created = await tasks.create({
      organizationId: org.id, title: 'T', assigneeIds: [ana.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    await tasks.update(created.id, { assigneeIds: [beto.id] } as never, undefined);
    const detail = await tasks.getById(created.id);
    const types = detail.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('ASSIGNEE_ADDED');
    expect(types).toContain('ASSIGNEE_REMOVED');
  });
});

describe('notificación de asignación (integración)', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ sent: true, id: 'x' } as never);
  });

  test('create: al asignar una tarea a otro usuario, se envía un correo', async () => {
    const org = await makeOrg();
    const actor = await makeUser({ name: 'CEO', email: 'ceo@vitam.tech', role: 'CEO' });
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });

    await tasks.create(
      { organizationId: org.id, title: 'Tarea con responsable', assigneeIds: [ana.id] } as never,
      asAuthUser(actor),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('ana@vitam.tech');
  });

  test('update: agregar un responsable nuevo notifica solo al nuevo', async () => {
    const org = await makeOrg();
    const actor = await makeUser({ name: 'CEO', email: 'ceo@vitam.tech', role: 'CEO' });
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });
    const luis = await makeUser({ name: 'Luis', email: 'luis@vitam.tech' });

    const tarea = await tasks.create(
      { organizationId: org.id, title: 'Tarea', assigneeIds: [ana.id] } as never,
      asAuthUser(actor),
    );
    sendEmailMock.mockClear();

    await tasks.update(tarea.id, { assigneeIds: [ana.id, luis.id] } as never, asAuthUser(actor));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('luis@vitam.tech');
  });
});
