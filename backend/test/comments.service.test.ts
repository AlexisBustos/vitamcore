import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser, makeTask } from './fixtures';
import * as comments from '../src/modules/tasks/comments.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('comments.service', () => {
  test('create adjunta autor y list lo devuelve (desc)', async () => {
    const org = await makeOrg();
    const user = await makeUser({ name: 'Ana' });
    const task = await makeTask(org.id);
    await comments.create(task.id, { body: 'Primero' } as never, user.id);
    await comments.create(task.id, { body: 'Segundo' } as never, user.id);
    const list = await comments.list(task.id);
    expect(list).toHaveLength(2);
    expect(list[0].body).toBe('Segundo'); // más reciente primero
    expect(list[0].author.name).toBe('Ana');
  });

  test('create sobre tarea inexistente => notFound (404)', async () => {
    const user = await makeUser();
    await expect(
      comments.create('no-existe', { body: 'X' } as never, user.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
