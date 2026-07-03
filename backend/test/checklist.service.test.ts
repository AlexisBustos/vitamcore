import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeTask } from './fixtures';
import * as checklist from '../src/modules/tasks/checklist.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('checklist.service', () => {
  test('addItem asigna position incremental', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const a = await checklist.addItem(task.id, { text: 'Uno' } as never);
    const b = await checklist.addItem(task.id, { text: 'Dos' } as never);
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  test('addItem sobre tarea inexistente => notFound (404)', async () => {
    await expect(
      checklist.addItem('no-existe', { text: 'X' } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('updateItem marca done y renombra', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const item = await checklist.addItem(task.id, { text: 'Uno' } as never);
    const upd = await checklist.updateItem(task.id, item.id, { done: true, text: 'Uno v2' } as never);
    expect(upd.done).toBe(true);
    expect(upd.text).toBe('Uno v2');
  });

  test('updateItem de ítem de otra tarea => notFound (404)', async () => {
    const org = await makeOrg();
    const t1 = await makeTask(org.id);
    const t2 = await makeTask(org.id, { title: 'Otra' });
    const item = await checklist.addItem(t1.id, { text: 'Uno' } as never);
    await expect(
      checklist.updateItem(t2.id, item.id, { done: true } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('removeItem elimina', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const item = await checklist.addItem(task.id, { text: 'Uno' } as never);
    await checklist.removeItem(task.id, item.id);
    const rest = await checklist.listByTask(task.id);
    expect(rest).toHaveLength(0);
  });
});
