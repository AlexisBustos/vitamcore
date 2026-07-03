import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg } from './fixtures';
import * as labels from '../src/modules/labels/labels.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('labels.service', () => {
  test('crea y lista por empresa', async () => {
    const org = await makeOrg();
    await labels.create({ organizationId: org.id, name: 'Urgente', color: 'red' } as never);
    const list = await labels.list({ organizationId: org.id } as never);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Urgente');
    expect(list[0].color).toBe('red');
  });

  test('nombre duplicado en la misma empresa => badRequest (400)', async () => {
    const org = await makeOrg();
    await labels.create({ organizationId: org.id, name: 'Dup', color: 'red' } as never);
    await expect(
      labels.create({ organizationId: org.id, name: 'Dup', color: 'blue' } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('update renombra y cambia color; remove elimina', async () => {
    const org = await makeOrg();
    const l = await labels.create({ organizationId: org.id, name: 'A', color: 'red' } as never);
    const upd = await labels.update(l.id, { name: 'B', color: 'green' } as never);
    expect(upd.name).toBe('B');
    expect(upd.color).toBe('green');
    await labels.remove(l.id);
    expect(await labels.list({ organizationId: org.id } as never)).toHaveLength(0);
  });
});
