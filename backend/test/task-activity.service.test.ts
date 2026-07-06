import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser, makeTask } from './fixtures';
import { diffScalarEvents } from '../src/modules/tasks/task-activity.service';
import * as tasks from '../src/modules/tasks/tasks.service';
import { prisma } from '../src/lib/prisma';

const base = {
  status: 'TODO' as const,
  projectId: null as string | null,
  dueDate: null as Date | null,
  startDate: null as Date | null,
};

describe('diffScalarEvents', () => {
  test('sin cambios => []', () => {
    expect(diffScalarEvents(base, {})).toEqual([]);
  });

  test('cambio de estado => STATUS_CHANGED con from/to', () => {
    const events = diffScalarEvents(base, { status: 'DOING' });
    expect(events).toEqual([{ type: 'STATUS_CHANGED', data: { from: 'TODO', to: 'DOING' } }]);
  });

  test('mismo valor enviado no genera evento', () => {
    expect(diffScalarEvents({ ...base, status: 'DOING' }, { status: 'DOING' })).toEqual([]);
  });

  test('cambio de fechas y proyecto', () => {
    const events = diffScalarEvents(base, {
      dueDate: new Date('2026-08-01'),
      startDate: new Date('2026-07-01'),
      projectId: 'p1',
    });
    expect(events.map((e) => e.type).sort()).toEqual(
      ['DUE_DATE_CHANGED', 'MOVED_PROJECT', 'START_DATE_CHANGED'].sort(),
    );
  });
});

beforeEach(resetDb);
afterAll(disconnect);

describe('actividad — integración', () => {
  test('create registra CREATED con actor', async () => {
    const org = await makeOrg();
    const user = await makeUser();
    await tasks.create({ organizationId: org.id, title: 'T', status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never, user.id);
    const detail = await tasks.getById((await prisma.task.findFirst())!.id);
    expect(detail.activity.map((a: { type: string }) => a.type)).toContain('CREATED');
    expect(detail.activity[detail.activity.length - 1].actorId).toBe(user.id);
  });

  test('update de estado registra STATUS_CHANGED', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id, { status: 'TODO' });
    await tasks.update(task.id, { status: 'DOING' } as never, null);
    const detail = await tasks.getById(task.id);
    expect(detail.activity.map((a: { type: string }) => a.type)).toContain('STATUS_CHANGED');
  });

  test('actorId opcional (agente pasa undefined) => actividad con actorId null', async () => {
    const org = await makeOrg();
    await tasks.create({ organizationId: org.id, title: 'IA', status: 'TODO', priority: 'MEDIUM', source: 'AI' } as never);
    const detail = await tasks.getById((await prisma.task.findFirst())!.id);
    expect(detail.activity[0].actorId).toBeNull();
  });
});
