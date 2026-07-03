import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeLabel } from './fixtures';
import * as tasks from '../src/modules/tasks/tasks.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('tasks — etiquetas y búsqueda', () => {
  test('crea con labelIds y startDate; list incluye las etiquetas', async () => {
    const org = await makeOrg();
    const label = await makeLabel(org.id, { name: 'Urgente', color: 'red' });
    await tasks.create({
      organizationId: org.id, title: 'Con etiqueta', labelIds: [label.id],
      startDate: new Date('2026-07-01'), status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list[0].startDate).not.toBeNull();
    expect(list[0].labels.map((tl: { label: { name: string } }) => tl.label.name)).toEqual(['Urgente']);
  });

  test('etiqueta de otra empresa => badRequest (400)', async () => {
    const orgA = await makeOrg('A');
    const orgB = await makeOrg('B');
    const labelB = await makeLabel(orgB.id);
    await expect(
      tasks.create({
        organizationId: orgA.id, title: 'X etiqueta ajena', labelIds: [labelB.id],
        status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('update reemplaza el set de etiquetas', async () => {
    const org = await makeOrg();
    const l1 = await makeLabel(org.id, { name: 'Uno' });
    const l2 = await makeLabel(org.id, { name: 'Dos' });
    const t = await tasks.create({ organizationId: org.id, title: 'T', labelIds: [l1.id], status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    await tasks.update(t.id, { labelIds: [l2.id] } as never);
    const detail = await tasks.getById(t.id);
    expect(detail.labels.map((tl: { label: { name: string } }) => tl.label.name)).toEqual(['Dos']);
  });

  test('búsqueda por texto en título', async () => {
    const org = await makeOrg();
    await tasks.create({ organizationId: org.id, title: 'Migrar servidor', status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    await tasks.create({ organizationId: org.id, title: 'Pagar factura', status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const res = await tasks.list({ search: 'migrar' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('Migrar servidor');
  });
});
