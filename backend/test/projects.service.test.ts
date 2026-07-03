import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser } from './fixtures';
import * as projects from '../src/modules/projects/projects.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('projects.create — responsable', () => {
  test('crea con ownerId válido y lo incluye en getById', async () => {
    const org = await makeOrg();
    const user = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const created = await projects.create({
      organizationId: org.id, name: 'Proyecto con dueño', ownerId: user.id,
      status: 'IDEA', priority: 'MEDIUM',
    } as never);
    const detail = await projects.getById(created.id);
    expect(detail.ownerId).toBe(user.id);
    expect(detail.owner?.name).toBe('Ana');
  });

  test('ownerId inexistente => badRequest (400)', async () => {
    const org = await makeOrg();
    await expect(
      projects.create({
        organizationId: org.id, name: 'X', ownerId: 'no-existe',
        status: 'IDEA', priority: 'MEDIUM',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
