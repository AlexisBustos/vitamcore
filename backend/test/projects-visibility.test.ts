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

describe('projects.create/update — memberIds', () => {
  test('admin crea con memberIds y quedan como miembros', async () => {
    const org = await makeOrg();
    const admin = await makeUser({ role: 'ADMIN' });
    const ana = await makeUser({ name: 'Ana', role: 'COLABORADOR' });
    const created = await projects.create(
      {
        organizationId: org.id, name: 'Con visibilidad',
        status: 'IDEA', priority: 'MEDIUM', memberIds: [ana.id, ana.id],
      } as never,
      asAuthUser(admin),
    );
    const detail = await projects.getById(created.id, asAuthUser(admin));
    // Duplicados deduplicados: un solo miembro.
    expect(detail.members.map((m) => m.user.id)).toEqual([ana.id]);
  });

  test('memberIds de un colaborador se ignora silenciosamente', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const created = await projects.create(
      {
        organizationId: org.id, name: 'De colaborador',
        status: 'IDEA', priority: 'MEDIUM', memberIds: [colab.id],
      } as never,
      asAuthUser(colab),
    );
    const detail = await projects.getById(created.id, asAuthUser(colab));
    expect(detail.members).toHaveLength(0); // sigue público
  });

  test('memberIds inexistente => 400', async () => {
    const org = await makeOrg();
    const admin = await makeUser({ role: 'ADMIN' });
    await expect(
      projects.create(
        {
          organizationId: org.id, name: 'X',
          status: 'IDEA', priority: 'MEDIUM', memberIds: ['no-existe'],
        } as never,
        asAuthUser(admin),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('update con memberIds reemplaza el set completo', async () => {
    const org = await makeOrg();
    const admin = await makeUser({ role: 'ADMIN' });
    const ana = await makeUser({ name: 'Ana', role: 'COLABORADOR' });
    const luis = await makeUser({ name: 'Luis', role: 'COLABORADOR' });
    const p = await makeProject(org.id, { name: 'P' });
    await addProjectMember(p.id, ana.id);

    await projects.update(p.id, { memberIds: [luis.id] } as never, asAuthUser(admin));
    const detail = await projects.getById(p.id, asAuthUser(admin));
    expect(detail.members.map((m) => m.user.id)).toEqual([luis.id]);

    // memberIds: [] limpia la lista => vuelve a ser público.
    await projects.update(p.id, { memberIds: [] } as never, asAuthUser(admin));
    const detail2 = await projects.getById(p.id, asAuthUser(admin));
    expect(detail2.members).toHaveLength(0);
  });
});

describe('projects.update/remove — guarda de visibilidad', () => {
  test('colaborador no puede editar ni borrar un proyecto que no ve', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const oculto = await makeProject(org.id, { name: 'Oculto' });
    await addProjectMember(oculto.id, otro.id);

    await expect(
      projects.update(oculto.id, { name: 'Hackeado' } as never, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      projects.remove(oculto.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
