# Visibilidad de proyectos por usuario — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada proyecto pueda restringirse a una lista de usuarios (tabla `ProjectMember`); los COLABORADOR solo ven proyectos públicos, donde son miembros, responsables o tienen tareas asignadas. CEO/ADMIN ven todo y son los únicos que gestionan la lista.

**Architecture:** Filtrado row-level en el backend (services de projects/tasks) con la regla centralizada en un helper `modules/shared/visibility.ts`. El frontend solo añade el picker de miembros en `ProjectForm` (admin) e indicadores; el filtrado de selectores llega gratis porque `GET /projects` y `GET /tasks` ya vienen filtrados.

**Tech Stack:** Express + Prisma (PostgreSQL), Zod, Vitest (BD de test real, `npm run test:db:setup`), React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-07-15-visibilidad-proyectos-design.md` — léelo antes de empezar. La regla de visibilidad (5 condiciones) y las decisiones de producto están ahí.

**Convenciones del repo que DEBES seguir:**
- Todo en español (comentarios, mensajes de error).
- Services lanzan errores con helpers de `src/utils/http-error.ts` (`notFound`, `badRequest`).
- Proyecto no visible → **404 `notFound('Proyecto no encontrado')`**, nunca 403 (no revelar existencia).
- Tests en `backend/test/*.test.ts` con `resetDb`/`disconnect` de `test/db.ts` y fixtures de `test/fixtures.ts`.
- Comandos de test se corren desde `backend/`: `npm test` (todos) o `npx vitest run test/<archivo>` (uno). Requieren Docker arriba (`docker compose up -d` en la raíz) y la BD de test migrada (`npm run test:db:setup`).

---

## Chunk 1: Backend — modelo, helper y proyectos

### Task 1: Modelo `ProjectMember` + migración

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelos `User` líneas ~263-280, `Project` ~352-385, y nuevo modelo tras `TaskAssignee` ~431)

- [ ] **Step 1: Añadir el modelo y las back-relations al schema**

En `backend/prisma/schema.prisma`, justo después del modelo `TaskAssignee` (línea ~431), añade:

```prisma
/// Miembro con visibilidad de un proyecto. Relación N–N entre Project y User.
/// Un proyecto SIN miembros es público (visible para todos); ver
/// docs/superpowers/specs/2026-07-15-visibilidad-proyectos-design.md.
model ProjectMember {
  projectId String
  userId    String

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation("ProjectMember", fields: [userId], references: [id], onDelete: Cascade)

  @@id([projectId, userId])
  @@index([userId])
  @@map("project_members")
}
```

En el modelo `User`, junto a `assignedTasks` (línea ~274), añade:

```prisma
  projectMemberships ProjectMember[] @relation("ProjectMember")
```

En el modelo `Project`, junto a `tasks` (línea ~372), añade:

```prisma
  members            ProjectMember[]
```

- [ ] **Step 2: Crear la migración y regenerar el cliente**

Desde `backend/` (Docker debe estar arriba):

```bash
npx prisma migrate dev --name project_members
```

(NO uses `npm run prisma:migrate`: ese script tiene `--name init` hardcodeado.)

Expected: crea `prisma/migrations/<timestamp>_project_members/` y regenera el cliente Prisma sin errores.

- [ ] **Step 3: Aplicar la migración a la BD de test**

```bash
npm run test:db:setup
```

Expected: `BD de test lista.`

- [ ] **Step 4: Verificar que el typecheck sigue verde**

```bash
npm run build
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(back): modelo ProjectMember para visibilidad de proyectos"
```

---

### Task 2: Helper compartido de visibilidad + fixtures + tests

**Files:**
- Create: `backend/src/modules/shared/visibility.ts`
- Modify: `backend/test/fixtures.ts`
- Test: `backend/test/visibility.test.ts`

- [ ] **Step 1: Añadir fixtures de apoyo**

En `backend/test/fixtures.ts`, al final del archivo:

```ts
export async function addProjectMember(projectId: string, userId: string) {
  return prisma.projectMember.create({ data: { projectId, userId } });
}

/** Convierte un User de BD al AuthUser que adjunta requireAuth. */
export function asAuthUser(u: { id: string; name: string; email: string; role: string }) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    mustChangePassword: false,
  };
}
```

- [ ] **Step 2: Escribir los tests que fallan**

Crea `backend/test/visibility.test.ts`:

```ts
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
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
npx vitest run test/visibility.test.ts
```

Expected: FAIL — `Cannot find module '../src/modules/shared/visibility'`.

- [ ] **Step 4: Implementar el helper**

Crea `backend/src/modules/shared/visibility.ts`:

```ts
/**
 * Visibilidad row-level de proyectos (y sus tareas).
 * Regla (spec docs/superpowers/specs/2026-07-15-visibilidad-proyectos-design.md):
 * CEO/ADMIN ven todo; un COLABORADOR ve un proyecto si es público (sin
 * miembros), está en la lista de miembros, tiene una tarea asignada en él
 * o es su responsable. Una tarea es visible si su proyecto lo es (o no tiene).
 *
 * Los services componen `projectVisibilityWhere` SIEMPRE dentro de
 * `where.AND` para no colisionar con otros `OR` (p. ej. la búsqueda por
 * texto de tareas usa `where.OR`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import { isAdminRole } from './roles';

/** True si al usuario hay que aplicarle filtrado de visibilidad (colaborador). */
export function isRestrictedUser(user?: AuthUser | null): user is AuthUser {
  return !!user && !isAdminRole(user.role);
}

/** Fragmento `where` con la condición de visibilidad de proyectos para un usuario. */
export function projectVisibilityWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { members: { none: {} } }, // público
      { members: { some: { userId } } }, // en la lista
      { tasks: { some: { assignees: { some: { userId } } } } }, // tarea asignada
      { ownerId: userId }, // responsable
    ],
  };
}

/**
 * 404 si el proyecto no existe o no es visible para el usuario.
 * Mismo mensaje que "no existe": no se revela la existencia de lo oculto.
 * Para CEO/ADMIN no hace nada (ni siquiera consulta).
 */
export async function assertProjectVisible(
  projectId: string,
  user?: AuthUser | null,
) {
  if (!isRestrictedUser(user)) return;
  const found = await prisma.project.findFirst({
    where: { id: projectId, AND: [projectVisibilityWhere(user.id)] },
    select: { id: true },
  });
  if (!found) throw notFound('Proyecto no encontrado');
}

/**
 * 404 si la tarea no existe o pertenece a un proyecto no visible.
 * Para CEO/ADMIN no hace nada: el llamador conserva su propio check de existencia.
 */
export async function assertTaskVisible(taskId: string, user?: AuthUser | null) {
  if (!isRestrictedUser(user)) return;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) throw notFound('Tarea no encontrada');
  if (task.projectId) await assertProjectVisible(task.projectId, user);
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
npx vitest run test/visibility.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/shared/visibility.ts test/visibility.test.ts test/fixtures.ts
git commit -m "feat(back): helper compartido de visibilidad de proyectos"
```

---

### Task 3: Filtrado de lectura en proyectos (`list`/`getById`)

**Files:**
- Modify: `backend/src/modules/projects/projects.service.ts:29-82`
- Modify: `backend/src/modules/projects/projects.controller.ts`
- Test: `backend/test/projects-visibility.test.ts` (nuevo)

- [ ] **Step 1: Escribir los tests que fallan**

Crea `backend/test/projects-visibility.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npx vitest run test/projects-visibility.test.ts
```

Expected: FAIL (los services aún no aceptan `user` ni filtran; el test de members falla por `members` undefined).

- [ ] **Step 3: Modificar `projects.service.ts`**

Añade imports (junto a los existentes):

```ts
import type { AuthUser } from '../../middleware/auth';
import {
  assertProjectVisible,
  isRestrictedUser,
  projectVisibilityWhere,
} from '../shared/visibility';
```

Reemplaza `list` (líneas 29-63) para aceptar el usuario y filtrar:

```ts
export async function list(filters: ListProjectsFilters, user?: AuthUser) {
  const where: Prisma.ProjectWhereInput = {
    organizationId: filters.organizationId,
    ownerId: filters.ownerId,
    businessUnitId: filters.businessUnitId,
    status: filters.status,
    priority: filters.priority,
  };
  // Visibilidad row-level: solo restringe a colaboradores. Va en AND para
  // no colisionar con otros OR (convención de shared/visibility.ts).
  if (isRestrictedUser(user)) {
    where.AND = [projectVisibilityWhere(user.id)];
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tasks: true } },
    },
  });

  if (projects.length === 0) return [];

  // Desglose de tareas por proyecto/estado para calcular el avance (done/total).
  const grouped = await prisma.task.groupBy({
    by: ['projectId', 'status'],
    where: { projectId: { in: projects.map((p) => p.id) } },
    _count: { _all: true },
  });

  return projects.map((project) => {
    const stats = grouped.filter((g) => g.projectId === project.id);
    const total = stats.reduce((sum, g) => sum + g._count._all, 0);
    const done =
      stats.find((g) => g.status === 'DONE')?._count._all ?? 0;
    return { ...project, taskStats: { total, done } };
  });
}
```

(El cuerpo tras el `findMany` es idéntico al actual — solo cambian la firma, el `where.AND` y el `include`.)

En `getById` (líneas 65-82): cambia la firma a `getById(id: string, user?: AuthUser)`, añade `await assertProjectVisible(id, user);` como PRIMERA línea, y añade al `include`:

```ts
      members: { include: { user: { select: { id: true, name: true } } } },
```

- [ ] **Step 4: Modificar `projects.controller.ts`**

```ts
export async function listController(req: Request, res: Response) {
  const filters = listProjectsQuery.parse(req.query);
  res.json({ data: await service.list(filters, req.user) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id, req.user) });
}
```

- [ ] **Step 5: Correr los tests nuevos y TODOS los existentes**

```bash
npx vitest run test/projects-visibility.test.ts && npm test
```

Expected: PASS todo (los tests existentes de projects llaman `getById(id)` sin usuario → sin filtro, siguen verdes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/projects test/projects-visibility.test.ts
git commit -m "feat(back): filtrar proyectos por visibilidad para colaboradores"
```

---

### Task 4: Escritura de miembros (`memberIds`) y guardas en `update`/`remove`

**Files:**
- Modify: `backend/src/modules/projects/projects.schema.ts:24-45`
- Modify: `backend/src/modules/projects/projects.service.ts:84-131`
- Modify: `backend/src/modules/projects/projects.controller.ts`
- Test: `backend/test/projects-visibility.test.ts` (ampliar)

- [ ] **Step 1: Escribir los tests que fallan**

Añade a `backend/test/projects-visibility.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npx vitest run test/projects-visibility.test.ts
```

Expected: FAIL en los describes nuevos.

- [ ] **Step 3: Añadir `memberIds` al schema Zod**

En `backend/src/modules/projects/projects.schema.ts`, dentro de `createProjectSchema` (tras `ownerId`, línea ~33):

```ts
  // Lista de visibilidad; vacía u omitida = proyecto público.
  // Solo la procesan CEO/ADMIN (el service la ignora para colaboradores).
  memberIds: z.array(z.string().min(1)).optional(),
```

(`updateProjectSchema` la hereda automáticamente vía `.omit().partial()`.)

- [ ] **Step 4: Modificar `create`, `update` y `remove` en `projects.service.ts`**

Añade a los imports de `../shared/relations`: `assertAssignableUsers`. Añade a los imports de `../shared/roles` (import nuevo): `isAdminRole`.

Reemplaza `create` (líneas 84-98):

```ts
export async function create(input: CreateProjectInput, user?: AuthUser) {
  const { memberIds, ...data } = input;
  await assertOrganization(data.organizationId);
  if (data.businessUnitId) {
    await assertBusinessUnitInOrganization(
      data.businessUnitId,
      data.organizationId,
    );
  }
  await assertAssignableUser(data.ownerId);
  // Solo un admin gestiona la visibilidad; si un colaborador manda
  // memberIds se ignora silenciosamente (spec: el campo no existe en su UI).
  const members =
    user && isAdminRole(user.role) ? [...new Set(memberIds ?? [])] : [];
  await assertAssignableUsers(members);
  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data });
      if (members.length) {
        await tx.projectMember.createMany({
          data: members.map((userId) => ({ projectId: project.id, userId })),
        });
      }
      return project;
    });
  } catch (err) {
    throw handleUniqueError(err);
  }
}
```

Reemplaza `update` (líneas 100-121):

```ts
export async function update(
  id: string,
  input: UpdateProjectInput,
  user?: AuthUser,
) {
  await assertProjectVisible(id, user);
  const { memberIds, ...data } = input;
  const current = await prisma.project.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!current) throw notFound('Proyecto no encontrado');

  // Si se cambia la unidad, debe pertenecer a la empresa del proyecto.
  if (data.businessUnitId) {
    await assertBusinessUnitInOrganization(
      data.businessUnitId,
      current.organizationId,
    );
  }
  await assertAssignableUser(data.ownerId);
  // memberIds (si viene) reemplaza el set completo; solo lo gestionan admins.
  const members =
    user && isAdminRole(user.role) && memberIds
      ? [...new Set(memberIds)]
      : undefined;
  if (members) await assertAssignableUsers(members);

  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.update({ where: { id }, data });
      if (members) {
        await tx.projectMember.deleteMany({ where: { projectId: id } });
        if (members.length) {
          await tx.projectMember.createMany({
            data: members.map((userId) => ({ projectId: id, userId })),
          });
        }
      }
      return project;
    });
  } catch (err) {
    throw handleUniqueError(err);
  }
}
```

En `remove` (líneas 123-131): cambia la firma a `remove(id: string, user?: AuthUser)` y añade `await assertProjectVisible(id, user);` como primera línea.

- [ ] **Step 5: Actualizar `projects.controller.ts`**

```ts
export async function createController(req: Request, res: Response) {
  const input = createProjectSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input, req.user) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateProjectSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input, req.user) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id, req.user);
  res.json({ ok: true });
}
```

- [ ] **Step 6: Correr tests y typecheck**

```bash
npx vitest run test/projects-visibility.test.ts && npm test && npm run build
```

Expected: PASS todo. OJO: si `npm test` rompe en `projects.service.test.ts` por la nueva firma, es porque esos tests llaman `create(input)` sin usuario — deben seguir pasando (usuario `undefined` = sin members); no los modifiques salvo error de compilación.

- [ ] **Step 7: Commit**

```bash
git add src/modules/projects test/projects-visibility.test.ts
git commit -m "feat(back): gestionar miembros de visibilidad en crear/editar proyecto"
```

---

## Chunk 2: Backend — tareas y subrecursos

### Task 5: Filtrado y guardas de visibilidad en tareas

**Files:**
- Modify: `backend/src/modules/tasks/tasks.service.ts`
- Modify: `backend/src/modules/tasks/tasks.controller.ts`
- Test: `backend/test/tasks-visibility.test.ts` (nuevo)

- [ ] **Step 1: Escribir los tests que fallan**

Crea `backend/test/tasks-visibility.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npx vitest run test/tasks-visibility.test.ts
```

Expected: FAIL por aserciones (Vitest NO typechequea: el argumento `AuthUser` extra se ignora en runtime; los tests fallan porque la lista devuelve tareas ocultas y los `rejects` no rechazan).

- [ ] **Step 3: Modificar `tasks.service.ts`**

**Cambio de firma clave:** las funciones reciben ahora el `AuthUser` completo en lugar de `actorId` (el id para la actividad sale de `user?.id`).

Añade imports:

```ts
import type { AuthUser } from '../../middleware/auth';
import {
  assertProjectVisible,
  isRestrictedUser,
  projectVisibilityWhere,
} from '../shared/visibility';
```

En `list` (línea 31): firma `list(filters: ListTasksFilters, user?: AuthUser)`. Tras el bloque de `filters.search` (línea ~54), añade:

```ts
  // Visibilidad row-level (colaboradores): la tarea es visible si no tiene
  // proyecto o si su proyecto es visible. En AND para no pisar el OR de búsqueda.
  if (isRestrictedUser(user)) {
    where.AND = [
      { OR: [{ projectId: null }, { project: projectVisibilityWhere(user.id) }] },
    ];
  }
```

En `getById` (línea 70): firma `getById(id: string, user?: AuthUser)`. Tras el `if (!task) throw notFound(...)` añade:

```ts
  if (task.projectId) await assertProjectVisible(task.projectId, user);
```

En `create` (línea 94): firma `create(input: CreateTaskInput, user?: AuthUser)`. Tras `assertRelations(...)` añade:

```ts
  // Un colaborador no puede colgar tareas de un proyecto que no ve (404,
  // el mismo error que si no existiera).
  if (input.projectId) await assertProjectVisible(input.projectId, user);
```

Y dentro de la transacción, en `recordActivity(tx, task.id, actorId, ...)` sustituye `actorId` por `user?.id`.

En `update` (línea 125): firma `update(id: string, input: UpdateTaskInput, user?: AuthUser)`. Tras el `if (!current) throw notFound(...)` añade:

```ts
  // La tarea actual debe ser visible, y también el proyecto destino si se mueve.
  if (current.projectId) await assertProjectVisible(current.projectId, user);
  if (input.projectId) await assertProjectVisible(input.projectId, user);
```

Y en `recordActivity(tx, id, actorId, ...)` sustituye `actorId` por `user?.id`.

En `remove` (línea 275): firma `remove(id: string, user?: AuthUser)`. Tras el `if (!existing) throw notFound(...)` añade:

```ts
  if (existing.projectId) await assertProjectVisible(existing.projectId, user);
```

- [ ] **Step 4: Actualizar `tasks.controller.ts`**

```ts
export async function listController(req: Request, res: Response) {
  const filters = listTasksQuery.parse(req.query);
  res.json({ data: await service.list(filters, req.user) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id, req.user) });
}

export async function createController(req: Request, res: Response) {
  const input = createTaskSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input, req.user) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateTaskSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input, req.user) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id, req.user);
  res.json({ ok: true });
}
```

- [ ] **Step 5: Arreglar llamadores rotos por el cambio de firma (lista exhaustiva)**

El cambio de `actorId?: string | null` a `user?: AuthUser` rompe estos llamadores conocidos (verificados por grep). Arréglalos así:

| Llamador | Cambio |
|---|---|
| `backend/src/modules/agent/agent.service.ts:134` (`convertProposedTask` → `createTask(input)`) | **Ninguno**: llama con un solo argumento; `user` queda `undefined` (flujo solo-admin, sin restricción y actividad sin actor, igual que hoy). |
| `backend/test/tasks.service.test.ts:53,86` (`tasks.update(id, ..., null)`) | Higiene de tipos: `null` ya no es asignable a `AuthUser | undefined` — cambia `null` → `undefined`. (En runtime `null` seguiría funcionando, pero deja el tipo incorrecto.) |
| `backend/test/task-activity.service.test.ts:57` (`tasks.update(task.id, ..., null)`) | Ídem: `null` → `undefined`. |
| `backend/test/task-activity.service.test.ts:48` (`tasks.create(..., user.id)`) | Pasa el usuario completo: `asAuthUser(user)` (importa el fixture). Ese test verifica el actor de la actividad, así que NO uses `undefined` — es el único llamador que rompe de verdad en runtime. |

**OJO: esta tabla es la fuente de verdad para los tests.** `npm run build` es `tsc` solo sobre `src/` (los tests NO se typechequean nunca; Vitest transpila sin verificar tipos), así que ningún comando delata llamadores olvidados en `test/`. Verifica que no haya otros con:

```bash
grep -rn "tasks.create\|tasks.update\|tasks.remove" test/
```

Para llamadores en `src/` no listados (no debería haber): pasar el `AuthUser` real del request, nunca fabricar uno.

```bash
npm run build
```

Expected: sin errores tras los arreglos.

- [ ] **Step 6: Correr todos los tests**

```bash
npx vitest run test/tasks-visibility.test.ts && npm test
```

Expected: PASS todo.

- [ ] **Step 7: Commit**

```bash
git add src/modules/tasks test/tasks-visibility.test.ts test/*.test.ts src/modules
git commit -m "feat(back): visibilidad de proyectos aplicada a tareas (lectura y escritura)"
```

---

### Task 6: Subrecursos de tareas (checklist y comentarios)

**Files:**
- Modify: `backend/src/modules/tasks/checklist.service.ts`
- Modify: `backend/src/modules/tasks/checklist.controller.ts`
- Modify: `backend/src/modules/tasks/comments.service.ts`
- Modify: `backend/src/modules/tasks/comments.controller.ts`
- Test: `backend/test/tasks-visibility.test.ts` (ampliar)

- [ ] **Step 1: Escribir los tests que fallan**

Añade a `backend/test/tasks-visibility.test.ts` (reutiliza el helper `setup()`):

```ts
import * as checklist from '../src/modules/tasks/checklist.service';
import * as comments from '../src/modules/tasks/comments.service';

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

  test('miembro del proyecto sí puede comentar (camino feliz)', async () => {
    const { org, otro, oculto } = await setup();
    const t = await makeTask(org.id, { projectId: oculto.id });
    const comment = await comments.create(
      t.id, { body: 'Ok' }, otro.id, asAuthUser(otro),
    );
    expect(comment.body).toBe('Ok');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npx vitest run test/tasks-visibility.test.ts
```

Expected: FAIL por aserciones (el parámetro extra se ignora en runtime; fallan los `rejects` que aún no rechazan).

- [ ] **Step 3: Modificar services de checklist y comentarios**

En ambos archivos, añade junto a los imports existentes (arriba del archivo):

```ts
import type { AuthUser } from '../../middleware/auth';
import { assertTaskVisible } from '../shared/visibility';
```

`checklist.service.ts` — añade `user?: AuthUser` como último parámetro y `await assertTaskVisible(taskId, user);` como primera línea en `addItem`, `updateItem` y `removeItem` (los checks de existencia actuales se conservan: `assertTaskVisible` no hace nada para admins). `listByTask` se deja SIN guarda a propósito: no tiene ruta HTTP (`tasks.routes.ts` no expone `GET /:id/checklist`); los ítems llegan embebidos en `tasks.getById`, que ya valida.

`comments.service.ts` — igual en `list(taskId, user?)` y `create(taskId, input, authorId, user?)`. Nota: `list` pasa de `function` síncrona a `async function` (hoy retorna la promesa de findMany directamente; añade `await assertTaskVisible(taskId, user)` antes y conserva el `return`).

- [ ] **Step 4: Actualizar los controllers**

`checklist.controller.ts`: añade `req.user` como último argumento en las tres llamadas a `service.*` (p. ej. `service.addItem(req.params.id, input, req.user)`).

`comments.controller.ts`:

```ts
export async function listCommentsController(req: Request, res: Response) {
  res.json({ data: await service.list(req.params.id, req.user) });
}

export async function createCommentController(req: Request, res: Response) {
  const input = createCommentSchema.parse(req.body);
  res
    .status(201)
    .json({ data: await service.create(req.params.id, input, req.user!.id, req.user) });
}
```

- [ ] **Step 5: Correr todos los tests y el build**

```bash
npm test && npm run build
```

Expected: PASS todo, build sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/modules/tasks test/tasks-visibility.test.ts
git commit -m "feat(back): visibilidad en checklist y comentarios de tareas"
```

---

## Chunk 3: Frontend y verificación final

### Task 7: Tipos + picker de visibilidad en `ProjectForm` (solo admin)

**Files:**
- Modify: `frontend/src/types/core.ts:84-105`
- Modify: `frontend/src/pages/projects/ProjectForm.tsx`

No hay framework de tests en frontend: la verificación es `npm run lint` (typecheck) + prueba manual (Task 9).

Nota: el requisito del spec "al guardar miembros también se invalida `tasks`" ya se cumple sin cambios — `invalidateProjectGraph` en `frontend/src/hooks/useProjects.ts:56-61` invalida `projects`, `organizations`, `tasks` y `dashboard` en el `onSuccess` de `useSaveProject`.

- [ ] **Step 1: Añadir `members` al tipo `Project`**

En `frontend/src/types/core.ts`, dentro de `interface Project` (tras `taskStats`, línea ~104):

```ts
  // Lista de visibilidad; vacía = visible para todos. Misma forma que Task.assignees.
  members?: { user: Ref }[];
```

- [ ] **Step 2: Añadir el picker en `ProjectForm.tsx`**

Imports nuevos:

```tsx
import { AssigneePicker } from '@/components/tasks/AssigneePicker';
import { useAuth } from '@/context/AuthContext';
import { isAdmin } from '@/lib/permissions';
```

(Verifica el nombre real del hook/exports en `frontend/src/context/AuthContext.tsx` antes de importar; si el hook se llama distinto, usa el existente.)

Dentro del componente (tras `const save = useSaveProject();`):

```tsx
  const { user } = useAuth();
  const admin = isAdmin(user?.role);
  const [memberIds, setMemberIds] = useState<string[]>(
    (project?.members ?? []).map((m) => m.user.id),
  );
```

En `handleSubmit`, añade `memberIds` al payload solo para admins — cambia la construcción de `base`:

```tsx
    const base = {
      businessUnitId: form.businessUnitId || null,
      // ... (campos existentes IGUAL)
      targetDate: form.targetDate || null,
      // Visibilidad: solo la envían admins (el backend la ignora para otros).
      ...(admin ? { memberIds } : {}),
    };
```

Tras el `<Field label="Responsable">` (línea ~185), añade:

```tsx
        {admin && (
          <Field label="Visibilidad">
            <AssigneePicker selected={memberIds} onChange={setMemberIds} />
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {memberIds.length === 0
                ? 'Sin selección: visible para todos los usuarios.'
                : 'Solo los seleccionados verán el proyecto (además de administradores, el responsable y quienes tengan tareas asignadas en él).'}
            </p>
          </Field>
        )}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run lint
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/core.ts src/pages/projects/ProjectForm.tsx
git commit -m "feat(front): selector de visibilidad por usuario en el formulario de proyecto"
```

---

### Task 8: Indicadores de proyecto restringido (listado y detalle)

**Files:**
- Modify: `frontend/src/pages/projects/ProjectsPage.tsx` (celda del nombre, líneas ~289-301; import lucide línea ~3-11)
- Modify: `frontend/src/pages/projects/ProjectDetailPage.tsx` (array `info`, líneas ~80-86)

- [ ] **Step 1: Candado en el listado**

En `ProjectsPage.tsx`: añade `Lock` al import de `lucide-react`. En la celda del nombre, justo después del `</Link>` (línea ~295):

```tsx
                        {(p.members?.length ?? 0) > 0 && (
                          <span
                            title={`Visible solo para: ${(p.members ?? [])
                              .map((m) => m.user.name)
                              .join(', ')}`}
                          >
                            <Lock className="ml-1 inline h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                          </span>
                        )}
```

- [ ] **Step 2: Fila "Visibilidad" en el detalle**

En `ProjectDetailPage.tsx`, añade al array `info` (tras "Responsable", línea ~83):

```ts
    {
      label: 'Visibilidad',
      value:
        project.members && project.members.length > 0
          ? project.members.map((m) => m.user.name).join(', ')
          : 'Todos',
    },
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run lint
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/pages/projects
git commit -m "feat(front): indicar visibilidad restringida en listado y detalle de proyecto"
```

---

### Task 9: Verificación final end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suites completas y builds**

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run lint && npm run build
```

Expected: todo verde.

- [ ] **Step 2: Prueba manual del flujo completo**

Con Docker + `npm run dev` en backend y frontend:

1. Login como admin (`ceo@vitam.tech`). Si no existe un usuario COLABORADOR, créalo en `/usuarios`.
2. Crea/edita un proyecto y restringe su visibilidad al propio CEO (campo "Visibilidad"). Verifica el candado en el listado y la fila "Visibilidad" en el detalle.
3. Login como el colaborador: el proyecto restringido NO aparece en `/proyectos`, ni sus tareas en `/tareas`, ni el proyecto en el selector del formulario de tarea. Navegar directo a `/proyectos/<id>` muestra "no encontrado".
4. Como admin, añade al colaborador a la lista (o asígnale una tarea del proyecto). Como colaborador, verifica que ahora sí lo ve.
5. Como colaborador, verifica que el formulario de proyecto NO muestra el campo "Visibilidad".

Expected: los 5 puntos se cumplen.

- [ ] **Step 3: Commit final (si hubo ajustes) y cierre**

Usa la skill superpowers:finishing-a-development-branch para decidir merge/PR.
