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
import * as tasks from '../src/modules/tasks/tasks.service';
import * as checklist from '../src/modules/tasks/checklist.service';
import * as comments from '../src/modules/tasks/comments.service';

beforeEach(resetDb);
afterAll(disconnect);

/** Escenario base: proyecto oculto para `colab` (miembro: `otro`) + proyecto público. */
async function setup() {
  const org = await makeOrg();
  const colab = await makeUser({ role: 'COLABORADOR' });
  const otro = await makeUser({ role: 'COLABORADOR' });
  const admin = await makeUser({ role: 'ADMIN' });
  const oculto = await makeProject(org.id, { name: 'Oculto' });
  await addProjectMember(oculto.id, otro.id);
  const publico = await makeProject(org.id, { name: 'Público' });
  return { org, colab, otro, admin, oculto, publico };
}

describe('tasks.list — visibilidad', () => {
  test('excluye tareas de proyectos ocultos; incluye sin proyecto y públicas', async () => {
    const { org, colab, oculto, publico } = await setup();
    await makeTask(org.id, { title: 'En oculto', projectId: oculto.id });
    await makeTask(org.id, { title: 'En público', projectId: publico.id });
    await makeTask(org.id, { title: 'Suelta' });

    const vistas = await tasks.list({} as never, asAuthUser(colab));
    expect(vistas.map((t) => t.title).sort()).toEqual(['En público', 'Suelta']);
  });

  test('incluye tareas de proyecto oculto si el colaborador está asignado', async () => {
    const { org, colab, oculto } = await setup();
    const asignada = await makeTask(org.id, { title: 'Mía', projectId: oculto.id });
    await prisma.taskAssignee.create({
      data: { taskId: asignada.id, userId: colab.id },
    });
    // Otra tarea del mismo proyecto: visible también (visibilidad implícita
    // del proyecto completo al tener una tarea asignada en él).
    await makeTask(org.id, { title: 'Hermana', projectId: oculto.id });

    const vistas = await tasks.list({} as never, asAuthUser(colab));
    expect(vistas.map((t) => t.title).sort()).toEqual(['Hermana', 'Mía']);
  });

  test('la búsqueda por texto se compone con la visibilidad (AND)', async () => {
    const { org, colab, oculto, publico } = await setup();
    await makeTask(org.id, { title: 'Informe secreto', projectId: oculto.id });
    await makeTask(org.id, { title: 'Informe público', projectId: publico.id });

    const vistas = await tasks.list({ search: 'Informe' } as never, asAuthUser(colab));
    expect(vistas.map((t) => t.title)).toEqual(['Informe público']);
  });
});

describe('tasks.getById — visibilidad', () => {
  test('404 en tarea de proyecto oculto; admin sí la ve', async () => {
    const { org, colab, admin, oculto } = await setup();
    const t = await makeTask(org.id, { projectId: oculto.id });

    await expect(tasks.getById(t.id, asAuthUser(colab))).rejects.toMatchObject({
      statusCode: 404,
    });
    const vista = await tasks.getById(t.id, asAuthUser(admin));
    expect(vista.id).toBe(t.id);
  });
});

describe('tasks.create/update — projectId hacia proyecto oculto', () => {
  test('colaborador no puede crear una tarea en un proyecto que no ve', async () => {
    const { org, colab, oculto } = await setup();
    await expect(
      tasks.create(
        {
          organizationId: org.id, title: 'Intrusa',
          status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
          projectId: oculto.id,
        } as never,
        asAuthUser(colab),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('crear tarea en proyecto oculto e inexistente dan el mismo 404 (no-enumeración)', async () => {
    const { org, colab, oculto } = await setup();
    const base = {
      organizationId: org.id, title: 'X',
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    };
    const errOculto = await tasks
      .create({ ...base, projectId: oculto.id } as never, asAuthUser(colab))
      .catch((e) => e);
    const errInexistente = await tasks
      .create({ ...base, projectId: 'no-existe' } as never, asAuthUser(colab))
      .catch((e) => e);
    expect(errOculto.statusCode).toBe(404);
    expect(errInexistente.statusCode).toBe(404);
    expect(errOculto.message).toBe(errInexistente.message);
  });

  test('miembro del proyecto restringido SÍ puede crear tareas en él (camino feliz)', async () => {
    const { org, otro, oculto } = await setup();
    const t = await tasks.create(
      {
        organizationId: org.id, title: 'Legítima',
        status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
        projectId: oculto.id,
      } as never,
      asAuthUser(otro),
    );
    expect(t.projectId).toBe(oculto.id);
  });

  test('colaborador no puede mover una tarea hacia un proyecto oculto ni editar una tarea oculta', async () => {
    const { org, colab, oculto, publico } = await setup();
    const visible = await makeTask(org.id, { projectId: publico.id });
    const escondida = await makeTask(org.id, { projectId: oculto.id });

    await expect(
      tasks.update(visible.id, { projectId: oculto.id } as never, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      tasks.update(escondida.id, { title: 'X' } as never, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('colaborador no puede borrar una tarea de un proyecto oculto', async () => {
    const { org, colab, oculto } = await setup();
    const t = await makeTask(org.id, { projectId: oculto.id });
    await expect(tasks.remove(t.id, asAuthUser(colab))).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('subrecursos — visibilidad', () => {
  test('checklist y comentarios de una tarea oculta => 404 para colaborador', async () => {
    const { org, colab, oculto } = await setup();
    const t = await makeTask(org.id, { projectId: oculto.id });

    await expect(
      checklist.addItem(t.id, { text: 'Item' }, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      comments.list(t.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      comments.create(t.id, { body: 'Hola' }, colab.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('editar y borrar ítems de checklist de una tarea oculta => 404 para colaborador', async () => {
    const { org, admin, colab, oculto } = await setup();
    const t = await makeTask(org.id, { projectId: oculto.id });
    // El admin crea el ítem (ve todo); el colaborador no debería poder tocarlo.
    const item = await checklist.addItem(t.id, { text: 'Item' }, asAuthUser(admin));

    await expect(
      checklist.updateItem(t.id, item.id, { done: true } as never, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      checklist.removeItem(t.id, item.id, asAuthUser(colab)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('miembro del proyecto sí puede comentar (camino feliz)', async () => {
    const { org, otro, oculto } = await setup();
    const t = await makeTask(org.id, { projectId: oculto.id });
    const comment = await comments.create(
      t.id, { body: 'Ok' }, otro.id, asAuthUser(otro),
    );
    expect(comment.body).toBe('Ok');
  });
});
