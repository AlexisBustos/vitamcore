import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import * as assignees from '../src/modules/assignees/assignees.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('assignees.listAssignables', () => {
  test('devuelve solo usuarios activos, con id/name/role y sin passwordHash', async () => {
    await makeUser({ name: 'Ana', email: 'ana@t.local', isActive: true });
    await makeUser({ name: 'Beto', email: 'beto@t.local', isActive: false });
    const list = await assignees.listAssignables();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Ana');
    expect(list[0]).not.toHaveProperty('passwordHash');
    expect(list[0]).toHaveProperty('role');
  });

  test('ordena por nombre', async () => {
    await makeUser({ name: 'Zoe', email: 'z@t.local' });
    await makeUser({ name: 'Ada', email: 'a@t.local' });
    const list = await assignees.listAssignables();
    expect(list.map((u) => u.name)).toEqual(['Ada', 'Zoe']);
  });
});
