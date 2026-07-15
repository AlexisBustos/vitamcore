import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  addProjectMember,
  asAuthUser,
  makeOrg,
  makeProject,
  makeUser,
} from './fixtures';
import * as projects from '../src/modules/projects/projects.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('projects.list — visibilidad', () => {
  test('colaborador solo ve públicos y donde participa; admin ve todo', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const admin = await makeUser({ role: 'ADMIN' });

    await makeProject(org.id, { name: 'Público' });
    const propio = await makeProject(org.id, { name: 'Propio' });
    await addProjectMember(propio.id, colab.id);
    const ajeno = await makeProject(org.id, { name: 'Ajeno' });
    await addProjectMember(ajeno.id, otro.id);

    const vistoColab = await projects.list({}, asAuthUser(colab));
    expect(vistoColab.map((p) => p.name).sort()).toEqual(['Propio', 'Público']);

    const vistoAdmin = await projects.list({}, asAuthUser(admin));
    expect(vistoAdmin).toHaveLength(3);
  });

  test('list incluye los miembros del proyecto', async () => {
    const org = await makeOrg();
    const admin = await makeUser({ role: 'ADMIN' });
    const user = await makeUser({ name: 'Ana', role: 'COLABORADOR' });
    const p = await makeProject(org.id, { name: 'Con miembros' });
    await addProjectMember(p.id, user.id);

    const [visto] = await projects.list({}, asAuthUser(admin));
    expect(visto.members.map((m) => m.user.name)).toEqual(['Ana']);
  });
});

describe('projects.getById — visibilidad', () => {
  test('colaborador ajeno recibe 404; miembro sí lo obtiene', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const restringido = await makeProject(org.id, { name: 'Restringido' });
    await addProjectMember(restringido.id, otro.id);

    await expect(
      projects.getById(restringido.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });

    const visto = await projects.getById(restringido.id, asAuthUser(otro));
    expect(visto.id).toBe(restringido.id);
  });

  test('proyecto oculto e inexistente son indistinguibles para el colaborador (no-enumeración)', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const oculto = await makeProject(org.id, { name: 'Oculto' });
    await addProjectMember(oculto.id, otro.id);

    const errOculto = await projects.getById(oculto.id, asAuthUser(colab)).catch((e) => e);
    const errInexistente = await projects.getById('no-existe', asAuthUser(colab)).catch((e) => e);
    expect(errOculto.statusCode).toBe(404);
    expect(errInexistente.statusCode).toBe(404);
    expect(errOculto.message).toBe(errInexistente.message);
  });
});
