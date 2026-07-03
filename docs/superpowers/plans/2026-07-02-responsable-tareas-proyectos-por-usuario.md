# Responsable de tareas y proyectos por usuario — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el `owner` de texto libre en `Task` y `Project` por una relación real a `User` (`ownerId`), con un endpoint `/assignees` para poblar el desplegable desde cualquier rol y un filtro "mis tareas".

**Architecture:** Backend Express + Prisma modular por dominio (routes/controller/service/schema). Se añade `ownerId String?` (FK a `User`, `onDelete: SetNull`) en `Task` y `Project`, un módulo de solo lectura `assignees`, y un helper `assertAssignableUser`. La migración es expand/contract (crear columna → migrar datos → borrar columna) escrita a mano. El frontend (React + TanStack Query) reemplaza el input de texto por un `<Select>` alimentado por `useAssignees()` y añade un toggle "Mis tareas".

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, Vitest (backend), React + Vite + TanStack Query (frontend).

**Spec:** `docs/superpowers/specs/2026-07-02-responsable-tareas-proyectos-por-usuario-design.md`

**Verificación global:** backend `npm run build` + `npm test`; frontend `npm run lint` + `npm run build`. Los tests de Vitest usan una BD real: `npm run test:db:setup` una vez (Docker arriba).

---

## Mapa de archivos

**Backend — crear:**
- `backend/src/modules/assignees/assignees.service.ts` — `listAssignables()` (usuarios activos, `{id,name,role}`).
- `backend/src/modules/assignees/assignees.controller.ts` — controller que responde `{ data }`.
- `backend/src/modules/assignees/assignees.routes.ts` — `GET /`.
- `backend/test/assignees.service.test.ts` — test del service.
- `backend/test/tasks.service.test.ts` — tests de tareas (ownerId, validación, filtro, include).
- `backend/test/projects.service.test.ts` — tests de proyectos (ownerId, validación, include).

**Backend — modificar:**
- `backend/prisma/schema.prisma` — `Task.ownerId`, `Project.ownerId`, back-relations en `User`, índices.
- `backend/prisma/migrations/<timestamp>_responsable_owner_id/migration.sql` — migración expand/contract (editada a mano).
- `backend/src/modules/shared/relations.ts` — `assertAssignableUser`.
- `backend/src/routes/index.ts` — montar `/assignees`.
- `backend/src/modules/tasks/tasks.schema.ts` — `owner`→`ownerId`, `ownerId` en list query.
- `backend/src/modules/tasks/tasks.service.ts` — validación, include `owner`, filtro.
- `backend/src/modules/projects/projects.schema.ts` — `owner`→`ownerId`, `ownerId` en list query.
- `backend/src/modules/projects/projects.service.ts` — validación, include `owner`, filtro.
- `backend/src/modules/agent/agent.service.ts` — `owner: null` → `ownerId: null`.
- `backend/prisma/seed.ts` — quitar el `owner` de texto (etiquetas de equipo, no usuarios).
- `backend/test/fixtures.ts` — añadir `makeProject`, `makeTask`.

**Frontend — crear:**
- `frontend/src/hooks/useAssignees.ts` — `useAssignees()`.

**Frontend — modificar:**
- `frontend/src/types/core.ts` — `Project`/`Task`: `owner: string|null` → `ownerId: string|null` + `owner: Ref|null`.
- `frontend/src/hooks/useTasks.ts` — `TaskFilters` gana `ownerId`.
- `frontend/src/pages/tasks/TaskForm.tsx` — `<Select>` de responsable.
- `frontend/src/pages/projects/ProjectForm.tsx` — `<Select>` de responsable.
- `frontend/src/pages/tasks/TasksPage.tsx` — columna Responsable + toggle "Mis tareas".
- `frontend/src/pages/projects/ProjectsPage.tsx` — buscar/mostrar `owner.name`.
- `frontend/src/pages/projects/ProjectDetailPage.tsx` — mostrar `owner.name`.

---

## Chunk 1: Modelo de datos y migración expand/contract

### Task 1: Schema Prisma — añadir `ownerId` y relaciones

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelos `User`, `Project`, `Task`)

- [ ] **Step 1: Modificar `Task`** — reemplazar la línea `owner String?` por `ownerId String?`, añadir la relación y el índice.

En el bloque `model Task`, cambiar:
```prisma
  owner          String?
```
por:
```prisma
  ownerId        String?
```
En la sección de relaciones de `Task` (junto a `project Project?`), añadir:
```prisma
  owner        User?         @relation("TaskOwner", fields: [ownerId], references: [id], onDelete: SetNull)
```
En la sección de índices de `Task` (junto a los `@@index` existentes), añadir:
```prisma
  @@index([ownerId])
```

- [ ] **Step 2: Modificar `Project`** — mismo cambio con la relación nombrada `"ProjectOwner"`.

En `model Project`, cambiar `owner String?` por `ownerId String?`. En relaciones añadir:
```prisma
  owner              User?               @relation("ProjectOwner", fields: [ownerId], references: [id], onDelete: SetNull)
```
En índices añadir:
```prisma
  @@index([ownerId])
```

- [ ] **Step 3: Modificar `User`** — añadir las back-relations.

En `model User`, antes de `@@map("users")`, añadir:
```prisma
  ownedTasks    Task[]    @relation("TaskOwner")
  ownedProjects Project[] @relation("ProjectOwner")
```

- [ ] **Step 4: Validar el schema**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(back): Task/Project.ownerId como FK a User en schema"
```

### Task 2: Migración expand/contract (datos preservados)

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_responsable_owner_id/migration.sql`

- [ ] **Step 1: Generar la migración vacía sin aplicarla**

Run: `cd backend && npx prisma migrate dev --name responsable_owner_id --create-only`
Expected: crea la carpeta `prisma/migrations/<timestamp>_responsable_owner_id/` con un `migration.sql` autogenerado. **No** se aplica todavía.

- [ ] **Step 2: Reescribir `migration.sql` a mano** (patrón expand/contract)

Prisma autogenera un `DROP owner` + `ADD ownerId` que borraría los datos antes de migrarlos. **Reemplaza todo el contenido** del archivo por este SQL, que crea la columna primero, migra los datos y borra la vieja al final:

```sql
-- 1. Expand: añadir ownerId (nullable) manteniendo owner
ALTER TABLE "tasks" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "projects" ADD COLUMN "ownerId" TEXT;

-- 2. Migrar datos: match por nombre normalizado contra usuarios ACTIVOS,
--    solo cuando el match es único (evita asignaciones arbitrarias).
UPDATE "tasks" t
SET "ownerId" = u.id
FROM "users" u
WHERE u."isActive" = true
  AND t."owner" IS NOT NULL AND btrim(t."owner") <> ''
  AND lower(btrim(u.name)) = lower(btrim(t."owner"))
  AND (
    SELECT count(*) FROM "users" u2
    WHERE u2."isActive" = true
      AND lower(btrim(u2.name)) = lower(btrim(t."owner"))
  ) = 1;

UPDATE "projects" p
SET "ownerId" = u.id
FROM "users" u
WHERE u."isActive" = true
  AND p."owner" IS NOT NULL AND btrim(p."owner") <> ''
  AND lower(btrim(u.name)) = lower(btrim(p."owner"))
  AND (
    SELECT count(*) FROM "users" u2
    WHERE u2."isActive" = true
      AND lower(btrim(u2.name)) = lower(btrim(p."owner"))
  ) = 1;

-- 3. Preservar los no matcheados en notes (sin pisar notes existente)
UPDATE "tasks"
SET "notes" = CASE
    WHEN "notes" IS NULL OR btrim("notes") = ''
      THEN 'Responsable previo (sin cuenta): ' || "owner"
    ELSE 'Responsable previo (sin cuenta): ' || "owner" || E'\n' || "notes"
  END
WHERE "ownerId" IS NULL AND "owner" IS NOT NULL AND btrim("owner") <> '';

UPDATE "projects"
SET "notes" = CASE
    WHEN "notes" IS NULL OR btrim("notes") = ''
      THEN 'Responsable previo (sin cuenta): ' || "owner"
    ELSE 'Responsable previo (sin cuenta): ' || "owner" || E'\n' || "notes"
  END
WHERE "ownerId" IS NULL AND "owner" IS NOT NULL AND btrim("owner") <> '';

-- 4. Contract: eliminar la columna de texto
ALTER TABLE "tasks" DROP COLUMN "owner";
ALTER TABLE "projects" DROP COLUMN "owner";

-- 5. Índices y claves foráneas
CREATE INDEX "tasks_ownerId_idx" ON "tasks"("ownerId");
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Aplicar la migración**

Run: `cd backend && npx prisma migrate dev`
Expected: aplica `<timestamp>_responsable_owner_id` sin errores y regenera el cliente Prisma. Si pide nombre porque detecta drift, no lo hay: el schema y el SQL ya coinciden.

- [ ] **Step 4: Regenerar el cliente Prisma (por si acaso)**

Run: `cd backend && npm run prisma:generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 5: Verificar que el backend compila con el nuevo cliente**

Run: `cd backend && npm run build`
Expected: falla en `tasks.service.ts`, `projects.service.ts`, `agent.service.ts` y schemas por referencias a `owner`. **Esto es esperado** — se corrige en el Chunk 3. (Si prefieres un build limpio por commit, salta este paso hasta el Chunk 3.)

- [ ] **Step 6: Aplicar la migración también a la BD de test**

`migrate dev` solo toca la BD de desarrollo; la BD de test se migra con `migrate deploy` vía el script de setup (idempotente). Sin esto, los tests de los Chunks 2–3 fallan con "column ownerId does not exist".

Run: `cd backend && npm run test:db:setup`
Expected: aplica las migraciones pendientes a `vitamcore_test` sin errores (Docker arriba).

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/migrations backend/prisma/schema.prisma
git commit -m "feat(back): migración expand/contract owner->ownerId (datos preservados)"
```

> **Nota sobre `test/db.ts`:** `resetDb` trunca `organizations`/`users`/`projects` con `CASCADE`; las nuevas FK `ownerId` quedan cubiertas por el cascade, así que **no** hace falta tocar `resetDb`.

---

## Chunk 2: Endpoint `/assignees` y validación

### Task 3: Helper `assertAssignableUser`

**Files:**
- Modify: `backend/src/modules/shared/relations.ts`

- [ ] **Step 1: Añadir el helper** al final de `relations.ts`:

```typescript
/**
 * Verifica que el usuario responsable exista (si viene ownerId).
 * Solo comprueba existencia, NO isActive: la restricción de "solo activos"
 * vive en el endpoint /assignees (lo que puebla el desplegable). Así, si un
 * responsable se desactiva luego, editar el registro no queda bloqueado.
 */
export async function assertAssignableUser(ownerId?: string | null) {
  if (!ownerId) return;
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true },
  });
  if (!user) throw badRequest('El responsable indicado no existe');
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/shared/relations.ts
git commit -m "feat(back): assertAssignableUser (valida existencia del responsable)"
```

### Task 4: Módulo `assignees` (solo lectura)

**Files:**
- Create: `backend/src/modules/assignees/assignees.service.ts`
- Create: `backend/src/modules/assignees/assignees.controller.ts`
- Create: `backend/src/modules/assignees/assignees.routes.ts`
- Test: `backend/test/assignees.service.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/test/assignees.service.test.ts`:
```typescript
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
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `cd backend && npx vitest run test/assignees.service.test.ts`
Expected: FAIL — no existe `../src/modules/assignees/assignees.service`.

- [ ] **Step 3: Implementar el service**

`backend/src/modules/assignees/assignees.service.ts`:
```typescript
/**
 * Lista de personas asignables como responsable. Solo lectura, sin passwordHash.
 * Endpoint accesible a todos los roles (a diferencia del módulo admin /users).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const assignableSelect = {
  id: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

export function listAssignables() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: assignableSelect,
    orderBy: { name: 'asc' },
  });
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `cd backend && npx vitest run test/assignees.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implementar controller y routes**

`backend/src/modules/assignees/assignees.controller.ts`:
```typescript
import type { Request, Response } from 'express';
import * as service from './assignees.service';

export async function listAssigneesController(_req: Request, res: Response) {
  res.json({ data: await service.listAssignables() });
}
```

`backend/src/modules/assignees/assignees.routes.ts`:
```typescript
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { listAssigneesController } from './assignees.controller';

export const assigneesRouter = Router();

assigneesRouter.get('/', asyncHandler(listAssigneesController));
```

- [ ] **Step 6: Montar la ruta** en `backend/src/routes/index.ts`.

Añadir el import junto a los demás:
```typescript
import { assigneesRouter } from '../modules/assignees/assignees.routes';
```
Y montar la ruta (accesible a todos los roles; solo GET, por eso `requireRole` y no `allowRoles`). Ponerla junto a projects/tasks:
```typescript
apiRouter.use('/assignees', requireAuth, requireRole(...ALL_ROLES), assigneesRouter);
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/assignees backend/src/routes/index.ts backend/test/assignees.service.test.ts
git commit -m "feat(back): GET /assignees (usuarios activos, todos los roles)"
```

---

## Chunk 3: Tareas, proyectos y agente

### Task 5: Fixtures de test para Project y Task

**Files:**
- Modify: `backend/test/fixtures.ts`

- [ ] **Step 1: Añadir helpers** al final de `fixtures.ts`:

```typescript
export async function makeProject(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.project.create({
    data: { organizationId, name: 'Proyecto Test', ...overrides } as Prisma.ProjectUncheckedCreateInput,
  });
}

export async function makeTask(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.task.create({
    data: { organizationId, title: 'Tarea Test', ...overrides } as Prisma.TaskUncheckedCreateInput,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/fixtures.ts
git commit -m "test(back): fixtures makeProject/makeTask"
```

### Task 6: Tareas — schema y service con `ownerId`

**Files:**
- Modify: `backend/src/modules/tasks/tasks.schema.ts`
- Modify: `backend/src/modules/tasks/tasks.service.ts`
- Test: `backend/test/tasks.service.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/test/tasks.service.test.ts`:
```typescript
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser } from './fixtures';
import * as tasks from '../src/modules/tasks/tasks.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('tasks.create — responsable', () => {
  test('crea con ownerId válido y lo incluye en el resultado al listar', async () => {
    const org = await makeOrg();
    const user = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    await tasks.create({
      organizationId: org.id, title: 'Tarea con dueño', ownerId: user.id,
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list[0].ownerId).toBe(user.id);
    expect(list[0].owner?.name).toBe('Ana');
  });

  test('ownerId inexistente => badRequest (400)', async () => {
    const org = await makeOrg();
    await expect(
      tasks.create({
        organizationId: org.id, title: 'X', ownerId: 'no-existe',
        status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('filtra por ownerId', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    await tasks.create({ organizationId: org.id, title: 'De Ana', ownerId: ana.id, status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    await tasks.create({ organizationId: org.id, title: 'De Beto', ownerId: beto.id, status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const soloAna = await tasks.list({ ownerId: ana.id } as never);
    expect(soloAna).toHaveLength(1);
    expect(soloAna[0].title).toBe('De Ana');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `cd backend && npx vitest run test/tasks.service.test.ts`
Expected: FAIL — errores de tipo por `ownerId` no existente en el schema Zod / el service.

- [ ] **Step 3: Actualizar `tasks.schema.ts`**

En `createTaskSchema`, reemplazar la línea:
```typescript
  owner: z.string().trim().max(200).optional().nullable(),
```
por:
```typescript
  ownerId: z.string().min(1).optional().nullable(),
```
En `listTasksQuery`, añadir tras `organizationId`:
```typescript
  ownerId: z.string().optional(),
```

- [ ] **Step 4: Actualizar `tasks.service.ts`**

Importar el helper (añadir a la lista de imports de `../shared/relations`):
```typescript
  assertAssignableUser,
```
En `list`, añadir el filtro al `where`:
```typescript
    ownerId: filters.ownerId,
```
En los `include` de `list` y `getById`, añadir junto a `project`:
```typescript
      owner: { select: { id: true, name: true } },
```
En `create`, tras `await assertRelations(...)`, añadir:
```typescript
  await assertAssignableUser(input.ownerId);
```
En `update`, tras `await assertRelations(...)`, añadir:
```typescript
  await assertAssignableUser(input.ownerId);
```

- [ ] **Step 5: Ejecutar el test para verlo pasar**

Run: `cd backend && npx vitest run test/tasks.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tasks backend/test/tasks.service.test.ts
git commit -m "feat(back): tareas usan ownerId (validación, include, filtro)"
```

### Task 7: Proyectos — schema y service con `ownerId`

**Files:**
- Modify: `backend/src/modules/projects/projects.schema.ts`
- Modify: `backend/src/modules/projects/projects.service.ts`
- Test: `backend/test/projects.service.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/test/projects.service.test.ts`:
```typescript
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
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `cd backend && npx vitest run test/projects.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Actualizar `projects.schema.ts`**

En `createProjectSchema`, reemplazar:
```typescript
  owner: z.string().trim().max(200).optional().nullable(),
```
por:
```typescript
  ownerId: z.string().min(1).optional().nullable(),
```
En `listProjectsQuery`, añadir:
```typescript
  ownerId: z.string().optional(),
```

- [ ] **Step 4: Actualizar `projects.service.ts`**

Importar el helper (añadir a los imports de `../shared/relations`):
```typescript
  assertAssignableUser,
```
En `list`, añadir al `where`:
```typescript
      ownerId: filters.ownerId,
```
En los `include` de `list` y `getById`, añadir:
```typescript
      owner: { select: { id: true, name: true } },
```
En `create`, tras la validación de `businessUnitId`, añadir:
```typescript
  await assertAssignableUser(input.ownerId);
```
En `update`, tras la validación de `businessUnitId`, añadir:
```typescript
  await assertAssignableUser(input.ownerId);
```

- [ ] **Step 5: Ejecutar el test para verlo pasar**

Run: `cd backend && npx vitest run test/projects.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/projects backend/test/projects.service.test.ts
git commit -m "feat(back): proyectos usan ownerId (validación, include, filtro)"
```

### Task 8: Agente — `convertProposedTask`

**Files:**
- Modify: `backend/src/modules/agent/agent.service.ts:144`

- [ ] **Step 1: Cambiar el campo** en la llamada a `createTask` dentro de `convertProposedTask`:

Reemplazar:
```typescript
    owner: null,
```
por:
```typescript
    ownerId: null,
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/agent/agent.service.ts
git commit -m "fix(back): convertProposedTask usa ownerId"
```

### Task 9: Seed — quitar el `owner` de texto

`prisma/seed.ts` está **excluido del tsconfig** (no lo atrapa `npm run build`), pero `npm run prisma:seed` (comando documentado) fallaría en runtime con "Unknown argument `owner`" tras eliminar la columna. Los valores del seed ("Dirección Healthcare", "Operativos", "CEO", etc.) son etiquetas de equipo, no nombres de usuarios reales, así que se eliminan (no se mapean a `ownerId`).

**Files:**
- Modify: `backend/prisma/seed.ts`

- [ ] **Step 1: Quitar `owner` de la interfaz `ProjectSeed`** — eliminar la línea `owner?: string;` (≈línea 117).

- [ ] **Step 2: Quitar `owner` del `create` de `seedProject`** — eliminar la línea `owner: p.owner,` (≈línea 142).

- [ ] **Step 3: Quitar `owner` de los literales de proyecto** — eliminar las 9 líneas `owner: '…',` dentro de los objetos de proyecto (≈líneas 201, 212, 222, 234, 244, 252, 262, 275, 284, 294).

- [ ] **Step 4: Quitar `owner` del `task.createMany`** — eliminar la línea `owner: 'CEO',` (≈línea 323).

- [ ] **Step 5: Verificar que el seed corre** (recrea la BD de dev con datos de ejemplo)

Run: `cd backend && npm run prisma:seed`
Expected: termina sin errores (sin "Unknown argument `owner`"). Los proyectos/tareas quedan con `ownerId` nulo.

- [ ] **Step 6: Verificar que todo el backend compila y pasa los tests**

Run: `cd backend && npm run build && npm test`
Expected: build limpio y **toda** la suite Vitest verde (incluye los nuevos assignees/tasks/projects). Si algún test viejo referenciaba `owner`, actualizarlo a `ownerId`.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "chore(back): seed sin owner de texto (owner->ownerId)"
```

---

## Chunk 4: Frontend

### Task 10: Tipos y hook `useAssignees`

**Files:**
- Modify: `frontend/src/types/core.ts`
- Create: `frontend/src/hooks/useAssignees.ts`

- [ ] **Step 1: Actualizar `types/core.ts`**

En `interface Project`, reemplazar `owner: string | null;` por:
```typescript
  ownerId: string | null;
  owner: Ref | null;
```
En `interface Task`, reemplazar `owner: string | null;` por:
```typescript
  ownerId: string | null;
  owner: Ref | null;
```
(`Ref` ya está definido como `{ id: string; name: string }` en el mismo archivo.)

- [ ] **Step 2: Crear el hook `useAssignees.ts`**

`frontend/src/hooks/useAssignees.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Assignee {
  id: string;
  name: string;
  role: 'CEO' | 'ADMIN' | 'COLABORADOR';
}

export function useAssignees() {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: () => api.get<{ data: Assignee[] }>('/assignees').then((r) => r.data),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/core.ts frontend/src/hooks/useAssignees.ts
git commit -m "feat(front): tipo owner como Ref + hook useAssignees"
```

### Task 11: TaskForm — desplegable de responsable

**Files:**
- Modify: `frontend/src/pages/tasks/TaskForm.tsx`

- [ ] **Step 1: Importar el hook** — añadir junto a los otros hooks:
```typescript
import { useAssignees } from '@/hooks/useAssignees';
```

- [ ] **Step 2: Consumir el hook y construir opciones** — dentro del componente, tras `const { data: organizations } = useOrganizations();`:
```typescript
  const { data: assignees } = useAssignees();
```
Y junto a los otros `useMemo` de opciones:
```typescript
  const assigneeOptions = useMemo(
    () => (assignees ?? []).map((u) => ({ value: u.id, label: u.name })),
    [assignees],
  );
```

- [ ] **Step 3: Cambiar el estado del form** — en el `useState`, reemplazar `owner: task?.owner ?? '',` por:
```typescript
    ownerId: task?.ownerId ?? '',
```

- [ ] **Step 4: Cambiar el payload** — en `handleSubmit`, en `base`, reemplazar `owner: form.owner || null,` por:
```typescript
      ownerId: form.ownerId || null,
```

- [ ] **Step 5: Reemplazar el input por un Select** — sustituir el bloque `<Field label="Responsable"> <Input .../> </Field>` por:
```tsx
        <Field label="Responsable">
          <Select
            options={assigneeOptions}
            placeholder="Sin asignar"
            value={form.ownerId}
            onChange={(e) => set('ownerId', e.target.value)}
          />
        </Field>
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (sin errores en TaskForm).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/tasks/TaskForm.tsx
git commit -m "feat(front): responsable de tarea como desplegable de usuarios"
```

### Task 12: ProjectForm — desplegable de responsable

**Files:**
- Modify: `frontend/src/pages/projects/ProjectForm.tsx`

- [ ] **Step 1: Importar y consumir `useAssignees`** — igual que en TaskForm (import, `const { data: assignees } = useAssignees();`, y el `assigneeOptions` con `useMemo`).

- [ ] **Step 2: Estado del form** — reemplazar `owner: project?.owner ?? '',` por `ownerId: project?.ownerId ?? '',`.

- [ ] **Step 3: Payload** — en `base`, reemplazar `owner: form.owner || null,` por `ownerId: form.ownerId || null,`.

- [ ] **Step 4: Reemplazar el input** — sustituir el `<Field label="Responsable"><Input .../></Field>` por el `<Select>` con `options={assigneeOptions}`, `placeholder="Sin asignar"`, `value={form.ownerId}`, `onChange={(e) => set('ownerId', e.target.value)}` (idéntico patrón a TaskForm Step 5).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/projects/ProjectForm.tsx
git commit -m "feat(front): responsable de proyecto como desplegable de usuarios"
```

### Task 13: Vistas de proyectos — mostrar `owner.name`

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDetailPage.tsx`
- Modify: `frontend/src/pages/projects/ProjectsPage.tsx`

- [ ] **Step 1: ProjectDetailPage** — en el array `info`, reemplazar:
```typescript
    { label: 'Responsable', value: project.owner ?? '—' },
```
por:
```typescript
    { label: 'Responsable', value: project.owner?.name ?? '—' },
```

- [ ] **Step 2: ProjectsPage — filtro de búsqueda** — reemplazar:
```typescript
          (p.owner ?? '').toLowerCase().includes(q) ||
```
por:
```typescript
          (p.owner?.name ?? '').toLowerCase().includes(q) ||
```

- [ ] **Step 3: ProjectsPage — celda de la tabla** — reemplazar:
```tsx
                        {p.owner ?? '—'}
```
por:
```tsx
                        {p.owner?.name ?? '—'}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/projects/ProjectDetailPage.tsx frontend/src/pages/projects/ProjectsPage.tsx
git commit -m "feat(front): proyectos muestran nombre del responsable"
```

### Task 14: TasksPage — columna Responsable y filtro "Mis tareas"

**Files:**
- Modify: `frontend/src/hooks/useTasks.ts`
- Modify: `frontend/src/pages/tasks/TasksPage.tsx`

- [ ] **Step 1: Ampliar `TaskFilters`** en `useTasks.ts` — añadir dentro del type:
```typescript
  ownerId?: string;
```

- [ ] **Step 2: Importar `useAuth`** en TasksPage — junto a los otros imports:
```typescript
import { useAuth } from '@/context/AuthContext';
```
Y dentro del componente:
```typescript
  const { user } = useAuth();
```

- [ ] **Step 3: Añadir el toggle "Mis tareas"** — en el bloque `<div className="mt-3 flex justify-end gap-1">`, antes de los botones Tabla/Kanban, añadir:
```tsx
          <Button
            size="sm"
            variant={filters.ownerId ? 'primary' : 'outline'}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                ownerId: f.ownerId ? undefined : user?.id,
              }))
            }
            className="mr-auto"
          >
            Mis tareas
          </Button>
```
(`mr-auto` empuja el toggle a la izquierda y deja Tabla/Kanban a la derecha.)

- [ ] **Step 4: Añadir la columna Responsable a la tabla** — en el `<thead>`, tras el `<th>Proyecto</th>`, añadir:
```tsx
                  <th className="px-4 py-3 font-medium">Responsable</th>
```
En el `<tbody>`, tras la celda del proyecto (`{task.project?.name ?? '—'}`), añadir:
```tsx
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {task.owner?.name ?? '—'}
                      </td>
```

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS y build de Vite exitoso.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useTasks.ts frontend/src/pages/tasks/TasksPage.tsx
git commit -m "feat(front): columna responsable + filtro Mis tareas en tareas"
```

---

## Verificación final (smoke manual)

- [ ] **Backend arriba** (`cd backend && npm run dev`) y **frontend** (`cd frontend && npm run dev`).
- [ ] Login como CEO (`ceo@vitam.tech` / `VitamCore2026!`). Crear/editar una tarea y un proyecto: el campo Responsable es un desplegable con las personas; "Sin asignar" deja `ownerId` nulo.
- [ ] La lista de tareas muestra el nombre del responsable; el filtro "Mis tareas" deja solo las asignadas al usuario logueado.
- [ ] El detalle y la tabla de proyectos muestran el nombre del responsable; la búsqueda por responsable funciona.
- [ ] Login como colaborador (`colaborador@vitam.tech` / `Colaborador2026!`): el desplegable de responsable se puebla (confirma que `/assignees` no está bloqueado por RBAC) y `/usuarios` sigue inaccesible.
- [ ] Verificar la migración de datos contra una copia con `owner` de texto previo: los nombres que matchean quedan asignados; los que no, con `ownerId` nulo y el prefijo "Responsable previo (sin cuenta): …" en `notes`.
