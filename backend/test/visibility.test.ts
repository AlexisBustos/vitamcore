import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { prisma } from '../src/lib/prisma';
import {
  addProjectMember,
  asAuthUser,
  makeOrg,
  makeProject,
  makeTask,
  makeUser,
} from './fixtures';
import {
  assertProjectVisible,
  assertTaskVisible,
  isRestrictedUser,
  projectVisibilityWhere,
} from '../src/modules/shared/visibility';

beforeEach(resetDb);
afterAll(disconnect);

describe('isRestrictedUser', () => {
  test('solo el colaborador está restringido', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const ceo = await makeUser({ role: 'CEO' });
    const colab = await makeUser({ role: 'COLABORADOR' });
    expect(isRestrictedUser(asAuthUser(admin))).toBe(false);
    expect(isRestrictedUser(asAuthUser(ceo))).toBe(false);
    expect(isRestrictedUser(asAuthUser(colab))).toBe(true);
    expect(isRestrictedUser(undefined)).toBe(false);
  });
});

describe('projectVisibilityWhere', () => {
  test('colaborador ve públicos, con membresía, como owner o con tarea asignada', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR', name: 'Colab' });
    const otro = await makeUser({ role: 'COLABORADOR', name: 'Otro' });

    // Público: sin miembros.
    await makeProject(org.id, { name: 'Público' });
    // Restringido donde colab es miembro.
    const conMembresia = await makeProject(org.id, { name: 'Miembro' });
    await addProjectMember(conMembresia.id, colab.id);
    // Restringido ajeno: NO debe verse.
    const ajeno = await makeProject(org.id, { name: 'Ajeno' });
    await addProjectMember(ajeno.id, otro.id);
    // Restringido donde colab es responsable.
    const comoOwner = await makeProject(org.id, { name: 'Owner', ownerId: colab.id });
    await addProjectMember(comoOwner.id, otro.id);
    // Restringido donde colab tiene una tarea asignada.
    const conTarea = await makeProject(org.id, { name: 'Tarea' });
    await addProjectMember(conTarea.id, otro.id);
    const tarea = await makeTask(org.id, { projectId: conTarea.id });
    await prisma.taskAssignee.create({ data: { taskId: tarea.id, userId: colab.id } });

    const visibles = await prisma.project.findMany({
      where: projectVisibilityWhere(colab.id),
      select: { name: true },
    });
    expect(visibles.map((p) => p.name).sort()).toEqual([
      'Miembro',
      'Owner',
      'Público',
      'Tarea',
    ]);
  });
});

describe('assertProjectVisible', () => {
  test('admin siempre pasa; colaborador ajeno recibe 404', async () => {
    const org = await makeOrg();
    const admin = await makeUser({ role: 'ADMIN' });
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const restringido = await makeProject(org.id, { name: 'Restringido' });
    await addProjectMember(restringido.id, otro.id);

    await expect(
      assertProjectVisible(restringido.id, asAuthUser(admin)),
    ).resolves.toBeUndefined();
    await expect(
      assertProjectVisible(restringido.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('colaborador pasa en proyecto público', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const publico = await makeProject(org.id, { name: 'Público' });
    await expect(
      assertProjectVisible(publico.id, asAuthUser(colab)),
    ).resolves.toBeUndefined();
  });
});

describe('assertTaskVisible', () => {
  test('404 si la tarea pertenece a un proyecto oculto; pasa si es visible o sin proyecto', async () => {
    const org = await makeOrg();
    const colab = await makeUser({ role: 'COLABORADOR' });
    const otro = await makeUser({ role: 'COLABORADOR' });
    const oculto = await makeProject(org.id, { name: 'Oculto' });
    await addProjectMember(oculto.id, otro.id);
    const tareaOculta = await makeTask(org.id, { projectId: oculto.id });
    const tareaSinProyecto = await makeTask(org.id, { title: 'Suelta' });

    await expect(
      assertTaskVisible(tareaOculta.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      assertTaskVisible(tareaSinProyecto.id, asAuthUser(colab)),
    ).resolves.toBeUndefined();
  });
});
