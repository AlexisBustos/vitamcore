import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser } from './fixtures';
import * as tasks from '../src/modules/tasks/tasks.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('tasks.create — responsable', () => {
  test('crea con ownerId válido y lo incluye en el resultado al listar', async () => {
    const org = await makeOrg();
    const user = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    await tasks.create({
      organizationId: org.id, title: 'Tarea con dueño', ownerId: user.id,
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list[0].ownerId).toBe(user.id);
    expect(list[0].owner?.name).toBe('Ana');
  });

  test('ownerId inexistente => badRequest (400)', async () => {
    const org = await makeOrg();
    await expect(
      tasks.create({
        organizationId: org.id, title: 'X', ownerId: 'no-existe',
        status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('filtra por ownerId', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    await tasks.create({ organizationId: org.id, title: 'De Ana', ownerId: ana.id, status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    await tasks.create({ organizationId: org.id, title: 'De Beto', ownerId: beto.id, status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const soloAna = await tasks.list({ ownerId: ana.id } as never);
    expect(soloAna).toHaveLength(1);
    expect(soloAna[0].title).toBe('De Ana');
  });
});
