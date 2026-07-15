import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { prisma } from '../src/lib/prisma';
import {
  addProjectMember,
  asAuthUser,
  makeOrg,
  makeProject,
  makeUser,
} from './fixtures';
import * as organizations from '../src/modules/organizations/organizations.service';
import * as businessUnits from '../src/modules/business-units/business-units.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('organizations.getById — proyectos embebidos filtrados', () => {
  test('colaborador no ve proyectos ocultos embebidos; admin sí', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const admin = await makeUser({ role: 'ADMIN' });
    await makeProject(org.id, { name: 'Público' });
    const oculto = await makeProject(org.id, { name: 'Oculto' });
    await addProjectMember(oculto.id, otro.id);

    const vistoColab = await organizations.getById(org.id, asAuthUser(colab));
    expect(vistoColab.projects.map((p) => p.name)).toEqual(['Público']);

    const vistoAdmin = await organizations.getById(org.id, asAuthUser(admin));
    expect(vistoAdmin.projects).toHaveLength(2);
  });
});

describe('businessUnits.getById — proyectos embebidos filtrados', () => {
  test('colaborador no ve proyectos ocultos embebidos; admin sí', async () => {
    const org = await makeOrg();
    const unit = await prisma.businessUnit.create({
      data: { organizationId: org.id, name: 'Unidad Test' },
    });
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const admin = await makeUser({ role: 'ADMIN' });
    await makeProject(org.id, { name: 'Público', businessUnitId: unit.id });
    const oculto = await makeProject(org.id, { name: 'Oculto', businessUnitId: unit.id });
    await addProjectMember(oculto.id, otro.id);

    const vistoColab = await businessUnits.getById(unit.id, asAuthUser(colab));
    expect(vistoColab.projects.map((p) => p.name)).toEqual(['Público']);

    const vistoAdmin = await businessUnits.getById(unit.id, asAuthUser(admin));
    expect(vistoAdmin.projects).toHaveLength(2);
  });
});
