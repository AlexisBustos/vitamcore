# Gestión de tareas rica e integrada — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la gestión de tareas en un sistema rico e integrado: tarjetas con etiquetas y fechas, un panel de tarjeta (drawer) reutilizable, búsqueda de tareas, e integración del detalle de proyecto (lista + tablero de sus tareas). Checklist (Fase 2) y actividad+comentarios (Fase 3) se planifican aparte.

**Architecture:** Backend Express + Prisma modular (routes/controller/service/schema). Se añaden `Task.startDate`, un modelo `Label` por empresa y su puente `TaskLabel`. Un módulo `labels` (CRUD) y extensiones a `tasks` (labelIds, búsqueda, include). Frontend React + TanStack Query: un `Drawer` base y un `TaskPanel` reutilizable abierto por query param `?tarea=<id>`, tarjetas enriquecidas, búsqueda, y un `ProjectDetailPage` que reutiliza las vistas de tareas (tabla + Kanban) acotadas al proyecto.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, Vitest (backend), React + Vite + TanStack Query + Tailwind v4 (frontend). Sin nuevas dependencias.

**Spec:** `docs/superpowers/specs/2026-07-03-gestion-tareas-rica-integrada-design.md`

**Alcance de este plan:** solo **Fase 1**. Fases 2 (checklist) y 3 (actividad + comentarios) tienen su alcance al final; cada una recibirá su propio plan cuando la Fase 1 esté mergeada.

**Verificación global:** backend `npm run build` + `npm test` (Vitest con BD real; `npm run test:db:setup` una vez, Docker arriba). Frontend `npm run lint` + `npm run build`.

---

## Mapa de archivos (Fase 1)

**Backend — crear:**
- `backend/src/modules/labels/labels.schema.ts` — Zod (create/update/listQuery) + enum de colores.
- `backend/src/modules/labels/labels.service.ts` — CRUD, P2002 → badRequest.
- `backend/src/modules/labels/labels.controller.ts` — controllers `{ data }`.
- `backend/src/modules/labels/labels.routes.ts` — rutas Express.
- `backend/test/labels.service.test.ts` — tests del módulo.
- `backend/test/tasks-labels-search.test.ts` — tests de labelIds + búsqueda en tasks.

**Backend — modificar:**
- `backend/prisma/schema.prisma` — `Task.startDate`, models `Label`/`TaskLabel`, back-relations en `Organization`/`Task`.
- `backend/prisma/migrations/<ts>_tarjetas_ricas_fase1/migration.sql` — migración aditiva.
- `backend/src/modules/shared/relations.ts` — `assertLabelsInOrganization`.
- `backend/src/routes/index.ts` — montar `/labels`.
- `backend/src/modules/tasks/tasks.schema.ts` — `startDate`, `labelIds`, `search`.
- `backend/src/modules/tasks/tasks.service.ts` — sync de labelIds, filtro search, include labels, getById enriquecido.
- `backend/test/fixtures.ts` — `makeLabel`.

**Frontend — crear:**
- `frontend/src/lib/labels.ts` — paleta de colores (clave → clases Tailwind) + opciones.
- `frontend/src/hooks/useLabels.ts` — `useLabels(orgId)`, `useSaveLabel`, `useDeleteLabel`.
- `frontend/src/components/ui/drawer.tsx` — panel lateral base.
- `frontend/src/components/tasks/TaskPanel.tsx` — panel de tarjeta (reutilizable).
- `frontend/src/components/tasks/LabelChips.tsx` — chips de etiqueta.
- `frontend/src/components/tasks/LabelPicker.tsx` — selector/creador de etiquetas.
- `frontend/src/components/tasks/TasksTableView.tsx` — tabla de tareas reutilizable (extraída de TasksPage).

**Frontend — modificar:**
- `frontend/src/types/core.ts` — `Task.startDate`, `Task.labels`; tipos `Label`, `TaskDetail`.
- `frontend/src/types/domain.ts` — re-exportar los tipos nuevos.
- `frontend/src/hooks/useTasks.ts` — `search` en `TaskFilters`; `useTaskDetail(id)`.
- `frontend/src/pages/tasks/TaskForm.tsx` — campo fecha de inicio + selector de etiquetas.
- `frontend/src/pages/tasks/TaskCard.tsx` — chips de etiqueta + iniciales del responsable.
- `frontend/src/pages/tasks/TasksPage.tsx` — búsqueda + apertura del panel por `?tarea`; usar `TasksTableView`.
- `frontend/src/pages/projects/ProjectDetailPage.tsx` — lista+tablero de tareas del proyecto + panel + búsqueda.

---

## Chunk 1: Modelo de datos y migración (Fase 1)

### Task 1: Schema Prisma — `startDate`, `Label`, `TaskLabel`

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Añadir `startDate` y back-relations a `Task`**

En `model Task`, tras `dueDate DateTime?` añadir:
```prisma
  startDate      DateTime?
```
En la sección de relaciones de `Task` (tras `owner ...`), añadir:
```prisma
  labels       TaskLabel[]
```

- [ ] **Step 2: Añadir back-relation a `Organization`**

En `model Organization`, junto a las otras colecciones (p. ej. tras `strategicDecisions StrategicDecision[]`), añadir:
```prisma
  labels                 Label[]
```

- [ ] **Step 3: Añadir los modelos `Label` y `TaskLabel`**

Tras el `model Task { ... }` (antes del bloque de "Módulos ejecutivos"), añadir:
```prisma
/// Etiqueta reutilizable de tareas, por empresa.
model Label {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  color          String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  tasks        TaskLabel[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("labels")
}

/// Puente muchos-a-muchos Task ↔ Label.
model TaskLabel {
  taskId  String
  labelId String

  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([taskId, labelId])
  @@index([labelId])
  @@map("task_labels")
}
```

- [ ] **Step 4: Validar el schema**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(back): Task.startDate + modelos Label/TaskLabel en schema"
```

### Task 2: Migración aditiva

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_tarjetas_ricas_fase1/migration.sql`

La migración es **puramente aditiva** (columna nullable + tablas nuevas), sin pérdida de datos, así que `prisma migrate dev` corre sin prompts interactivos.

- [ ] **Step 1: Crear y aplicar la migración**

Run: `cd backend && npx prisma migrate dev --name tarjetas_ricas_fase1`
Expected: crea `prisma/migrations/<ts>_tarjetas_ricas_fase1/` y la aplica a la BD de dev; regenera el cliente. Sin advertencias de data-loss.

> Si el entorno no-interactivo bloqueara el comando (no debería, al ser aditivo), usar el patrón manual: crear la carpeta `<ts>_tarjetas_ricas_fase1/migration.sql` a mano con los `CREATE TABLE "labels"`, `CREATE TABLE "task_labels"`, `ALTER TABLE "tasks" ADD COLUMN "startDate" TIMESTAMP(3)`, índices y FKs, y aplicar con `npx prisma migrate deploy`.

- [ ] **Step 2: Regenerar cliente (por si acaso)**

Run: `cd backend && npm run prisma:generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 3: Aplicar la migración a la BD de test**

Run: `cd backend && npm run test:db:setup`
Expected: aplica la migración a `vitamcore_test` sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/migrations
git commit -m "feat(back): migración tarjetas ricas fase 1 (startDate, labels, task_labels)"
```

---

## Chunk 2: Backend — etiquetas y tareas (Fase 1)

### Task 3: Helper `assertLabelsInOrganization`

**Files:**
- Modify: `backend/src/modules/shared/relations.ts`

- [ ] **Step 1: Añadir el helper** al final de `relations.ts`:

```typescript
/**
 * Verifica que todas las etiquetas existan y pertenezcan a la empresa indicada.
 * Evita asignar a una tarea etiquetas de otra empresa.
 */
export async function assertLabelsInOrganization(
  labelIds: string[],
  organizationId: string,
) {
  if (labelIds.length === 0) return;
  const found = await prisma.label.findMany({
    where: { id: { in: labelIds } },
    select: { id: true, organizationId: true },
  });
  if (found.length !== labelIds.length) {
    throw badRequest('Alguna etiqueta indicada no existe');
  }
  if (found.some((l) => l.organizationId !== organizationId)) {
    throw badRequest('Alguna etiqueta no pertenece a la empresa indicada');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/shared/relations.ts
git commit -m "feat(back): assertLabelsInOrganization (coherencia de etiquetas)"
```

### Task 4: Módulo `labels` (CRUD por empresa)

**Files:**
- Create: `backend/src/modules/labels/labels.schema.ts`
- Create: `backend/src/modules/labels/labels.service.ts`
- Create: `backend/src/modules/labels/labels.controller.ts`
- Create: `backend/src/modules/labels/labels.routes.ts`
- Modify: `backend/src/routes/index.ts`
- Test: `backend/test/labels.service.test.ts`
- Modify: `backend/test/fixtures.ts`

- [ ] **Step 1: Añadir fixture `makeLabel`** en `backend/test/fixtures.ts`:

```typescript
export async function makeLabel(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.label.create({
    data: { organizationId, name: 'Etiqueta Test', color: 'blue', ...overrides } as Prisma.LabelUncheckedCreateInput,
  });
}
```

- [ ] **Step 2: Escribir el test que falla** — `backend/test/labels.service.test.ts`:

```typescript
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
```

- [ ] **Step 3: Ejecutar el test para verlo fallar**

Run: `cd backend && npx vitest run test/labels.service.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 4: Implementar `labels.schema.ts`**

```typescript
import { z } from 'zod';

// Paleta fija de colores de etiqueta (clave); el frontend la mapea a clases.
export const labelColorEnum = z.enum([
  'red', 'orange', 'yellow', 'green', 'teal',
  'blue', 'purple', 'pink', 'gray', 'brown',
]);

export const createLabelSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(40),
  color: labelColorEnum,
});

export const updateLabelSchema = createLabelSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listLabelsQuery = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type ListLabelsFilters = z.infer<typeof listLabelsQuery>;
```

- [ ] **Step 5: Implementar `labels.service.ts`**

```typescript
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertOrganization } from '../shared/relations';
import type { CreateLabelInput, ListLabelsFilters, UpdateLabelInput } from './labels.schema';

export function list(filters: ListLabelsFilters) {
  return prisma.label.findMany({
    where: { organizationId: filters.organizationId },
    orderBy: { name: 'asc' },
  });
}

export async function create(input: CreateLabelInput) {
  await assertOrganization(input.organizationId);
  try {
    return await prisma.label.create({ data: input });
  } catch (err) {
    throw handleUnique(err);
  }
}

export async function update(id: string, input: UpdateLabelInput) {
  const exists = await prisma.label.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Etiqueta no encontrada');
  try {
    return await prisma.label.update({ where: { id }, data: input });
  } catch (err) {
    throw handleUnique(err);
  }
}

export async function remove(id: string) {
  const exists = await prisma.label.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Etiqueta no encontrada');
  await prisma.label.delete({ where: { id } }); // TaskLabel se borra por cascade
}

function handleUnique(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return badRequest('Ya existe una etiqueta con ese nombre en la empresa');
  }
  return err;
}
```

- [ ] **Step 6: Ejecutar el test para verlo pasar**

Run: `cd backend && npx vitest run test/labels.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Implementar controller y routes**

`labels.controller.ts`:
```typescript
import type { Request, Response } from 'express';
import { createLabelSchema, listLabelsQuery, updateLabelSchema } from './labels.schema';
import * as service from './labels.service';

export async function listController(req: Request, res: Response) {
  res.json({ data: await service.list(listLabelsQuery.parse(req.query)) });
}
export async function createController(req: Request, res: Response) {
  res.status(201).json({ data: await service.create(createLabelSchema.parse(req.body)) });
}
export async function updateController(req: Request, res: Response) {
  res.json({ data: await service.update(req.params.id, updateLabelSchema.parse(req.body)) });
}
export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}
```

`labels.routes.ts`:
```typescript
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { createController, listController, removeController, updateController } from './labels.controller';

export const labelsRouter = Router();
labelsRouter.get('/', asyncHandler(listController));
labelsRouter.post('/', asyncHandler(createController));
labelsRouter.patch('/:id', asyncHandler(updateController));
labelsRouter.delete('/:id', asyncHandler(removeController));
```

- [ ] **Step 8: Montar `/labels`** en `backend/src/routes/index.ts` — añadir el import junto a projects/tasks:
```typescript
import { labelsRouter } from '../modules/labels/labels.routes';
```
y la ruta (todos los roles, junto a assignees):
```typescript
apiRouter.use('/labels', requireAuth, requireRole(...ALL_ROLES), labelsRouter);
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/labels backend/src/routes/index.ts backend/test/labels.service.test.ts backend/test/fixtures.ts
git commit -m "feat(back): módulo labels (CRUD por empresa, paleta de colores)"
```

### Task 5: Tareas — `startDate`, `labelIds`, búsqueda, include

**Files:**
- Modify: `backend/src/modules/tasks/tasks.schema.ts`
- Modify: `backend/src/modules/tasks/tasks.service.ts`
- Test: `backend/test/tasks-labels-search.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `backend/test/tasks-labels-search.test.ts`:

```typescript
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
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `cd backend && npx vitest run test/tasks-labels-search.test.ts`
Expected: FAIL.

- [ ] **Step 3: Actualizar `tasks.schema.ts`**

En `createTaskSchema`, tras `dueDate: dateInput,` añadir:
```typescript
  startDate: dateInput,
  labelIds: z.array(z.string().min(1)).optional(),
```
En `listTasksQuery`, tras `organizationId`, añadir:
```typescript
  search: z.string().trim().min(1).optional(),
```
(`updateTaskSchema` hereda `startDate` y `labelIds` vía `.partial()`.)

- [ ] **Step 4: Actualizar `tasks.service.ts`**

Importar el helper (añadir a los imports de `../shared/relations`):
```typescript
  assertLabelsInOrganization,
```
El bloque `include` de `list`/`getById` suma las etiquetas (usar `replace_all`, aparece en ambos):
```typescript
      owner: { select: { id: true, name: true } },
      labels: { include: { label: true } },
```
En `list`, ampliar el `where` con la búsqueda (tras construir el objeto base):
```typescript
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
```
Extraer `labelIds` del input antes de escribir, y sincronizarlo. En `create`, reemplazar el bloque de creación por:
```typescript
  await assertOrganization(input.organizationId);
  await assertRelations(input.organizationId, input.businessUnitId, input.projectId);
  await assertAssignableUser(input.ownerId);
  const { labelIds, ...data } = input;
  if (labelIds?.length) await assertLabelsInOrganization(labelIds, input.organizationId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data });
    if (labelIds?.length) {
      await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId: task.id, labelId })) });
    }
    if (task.projectId) await syncProjectStatus(task.projectId, tx);
    return task;
  });
```
En `update`, tras las validaciones existentes, manejar `labelIds` (reemplazo completo del set) dentro de la transacción:
```typescript
  const { labelIds, ...data } = input;
  if (labelIds) await assertLabelsInOrganization(labelIds, current.organizationId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id }, data });
    if (labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } });
      if (labelIds.length) {
        await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId: id, labelId })) });
      }
    }
    // ...sincronización de proyecto existente (mantener)...
    return task;
  });
```
> Nota: `create`/`update` devuelven el `task` base (sin labels) como hoy; el frontend recarga vía invalidación. `getById` sí trae las labels para el panel.

- [ ] **Step 5: Ejecutar el test para verlo pasar**

Run: `cd backend && npx vitest run test/tasks-labels-search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tasks backend/test/tasks-labels-search.test.ts
git commit -m "feat(back): tareas con startDate, labelIds y búsqueda por texto"
```

### Task 6: Verificación integral del backend (Fase 1)

**Files:** —

- [ ] **Step 1: Actualizar el test existente de tareas** — `backend/test/tasks.service.test.ts` usa `list()[0].owner?.name`; verificar que el nuevo include `labels` no rompe nada (no debería). Ejecutar toda la suite:

Run: `cd backend && npm run build && npm test`
Expected: build limpio y **toda** la suite verde (incluye labels y tasks-labels-search). El agente (`convertProposedTask`) no envía `labelIds`, así que sigue compilando sin cambios.

- [ ] **Step 2: Commit (si hubo ajustes)**

```bash
git add -A backend/test
git commit -m "test(back): ajustes menores tras include de labels" || echo "sin cambios"
```

---

## Chunk 3: Frontend — panel de tarjeta, tarjeta rica y búsqueda (Fase 1)

### Task 7: Paleta de colores y tipos

**Files:**
- Create: `frontend/src/lib/labels.ts`
- Modify: `frontend/src/types/core.ts`
- Modify: `frontend/src/types/domain.ts`

- [ ] **Step 1: Crear `lib/labels.ts`** (mapa clave → clases Tailwind, espejo de la paleta del backend):

```typescript
export type LabelColor =
  | 'red' | 'orange' | 'yellow' | 'green' | 'teal'
  | 'blue' | 'purple' | 'pink' | 'gray' | 'brown';

// Clase de fondo/borde/texto por color. Chips sólidos suaves.
export const labelColorClass: Record<LabelColor, string> = {
  red: 'bg-red-100 text-red-800 border-red-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  pink: 'bg-pink-100 text-pink-800 border-pink-200',
  gray: 'bg-gray-100 text-gray-800 border-gray-200',
  brown: 'bg-amber-100 text-amber-900 border-amber-200',
};

export const labelColorOptions = (Object.keys(labelColorClass) as LabelColor[]).map((c) => ({
  value: c,
  label: c,
}));
```

- [ ] **Step 2: Actualizar `types/core.ts`** — añadir tipos y campos.

Añadir el tipo `Label` (junto a los demás):
```typescript
export interface Label {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
export interface TaskLabel {
  label: Label;
}
```
En `interface Task`, tras `dueDate`, añadir:
```typescript
  startDate: string | null;
```
y tras `owner`, añadir:
```typescript
  labels?: TaskLabel[];
```
Añadir el tipo del detalle (por ahora igual a Task + labels garantizadas; se ampliará en Fases 2/3):
```typescript
export interface TaskDetail extends Task {
  labels: TaskLabel[];
}
```

- [ ] **Step 3: Re-exportar en el barrel `types/domain.ts`** — añadir `Label`, `TaskLabel`, `TaskDetail` a la lista de tipos re-exportados desde `./core`.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (los consumidores existentes de `Task` no rompen; `startDate`/`labels` son nuevos/opcionales).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/labels.ts frontend/src/types/core.ts frontend/src/types/domain.ts
git commit -m "feat(front): tipos Label/TaskDetail + paleta de colores de etiquetas"
```

### Task 8: Hooks `useLabels` y detalle/búsqueda de tareas

**Files:**
- Create: `frontend/src/hooks/useLabels.ts`
- Modify: `frontend/src/hooks/useTasks.ts`

- [ ] **Step 1: Crear `hooks/useLabels.ts`**:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Label } from '@/types/domain';

export function useLabels(organizationId?: string) {
  return useQuery({
    queryKey: ['labels', organizationId],
    enabled: !!organizationId,
    queryFn: () =>
      api.get<{ data: Label[] }>(`/labels${toQuery({ organizationId })}`).then((r) => r.data),
  });
}

export function useSaveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id ? api.patch(`/labels/${payload.id}`, payload.data) : api.post('/labels', payload.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels'] }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/labels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['tasks'] }); // las tarjetas muestran labels
    },
  });
}
```

- [ ] **Step 2: Ampliar `hooks/useTasks.ts`** — añadir `search` a `TaskFilters`:
```typescript
  search?: string;
```
Y un hook de detalle para el panel (tras `useTasks`):
```typescript
export function useTaskDetail(id: string | null) {
  return useQuery({
    queryKey: ['tasks', 'detail', id],
    enabled: !!id,
    queryFn: () => api.get<{ data: TaskDetail }>(`/tasks/${id}`).then((r) => r.data),
  });
}
```
Añadir el import del tipo: `import type { Task, TaskStatus, TaskDetail } from '@/types/domain';`. Y en `invalidateTaskGraph`, no hace falta cambio (ya invalida `['tasks']`, que cubre el detalle).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useLabels.ts frontend/src/hooks/useTasks.ts
git commit -m "feat(front): hooks useLabels + useTaskDetail + filtro search"
```

### Task 9: Componente `Drawer` base

**Files:**
- Create: `frontend/src/components/ui/drawer.tsx`

- [ ] **Step 1: Crear `drawer.tsx`** (panel lateral derecho, mismo patrón de overlay/Escape que `modal.tsx`):

```typescript
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}

/** Panel lateral que se desliza desde la derecha. Sin dependencias externas. */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={cn(
          'flex h-full w-full max-w-lg flex-col overflow-y-auto border-l',
          'border-[var(--color-border)] bg-[var(--color-card)] shadow-xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--color-border)] p-4">
          <div className="text-base font-semibold text-[var(--color-foreground)]">{title}</div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/components/ui/drawer.tsx
git commit -m "feat(front): componente Drawer (panel lateral base)"
```

### Task 10: Chips y selector de etiquetas

**Files:**
- Create: `frontend/src/components/tasks/LabelChips.tsx`
- Create: `frontend/src/components/tasks/LabelPicker.tsx`

- [ ] **Step 1: `LabelChips.tsx`** — muestra un conjunto de etiquetas como chips de color:

```typescript
import { labelColorClass, type LabelColor } from '@/lib/labels';
import type { Label } from '@/types/domain';

export function LabelChips({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l.id}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${labelColorClass[l.color as LabelColor] ?? labelColorClass.gray}`}
        >
          {l.name}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `LabelPicker.tsx`** — selecciona qué etiquetas tiene la tarjeta y permite crear nuevas. Recibe `organizationId`, `selected: string[]`, `onChange`. Usa `useLabels(organizationId)`, `useSaveLabel`. Marca/desmarca ids; un pequeño form (input nombre + `Select` de `labelColorOptions`) crea una etiqueta y la añade a `selected`.

```typescript
import { useState } from 'react';
import { useLabels, useSaveLabel } from '@/hooks/useLabels';
import { labelColorClass, labelColorOptions, type LabelColor } from '@/lib/labels';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Label } from '@/types/domain';

interface Props {
  organizationId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function LabelPicker({ organizationId, selected, onChange }: Props) {
  const { data: labels } = useLabels(organizationId);
  const save = useSaveLabel();
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  async function create() {
    if (!name.trim()) return;
    const res = await save.mutateAsync({ data: { organizationId, name: name.trim(), color } });
    const created = (res as { data: Label }).data;
    onChange([...selected, created.id]);
    setName('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(labels ?? []).map((l) => {
          const on = selected.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className={`rounded-full border px-2 py-0.5 text-xs ${labelColorClass[l.color as LabelColor] ?? labelColorClass.gray} ${on ? 'ring-2 ring-[var(--color-accent)]' : 'opacity-60'}`}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva etiqueta" />
        <Select options={labelColorOptions} value={color} onChange={(e) => setColor(e.target.value as LabelColor)} />
        <Button type="button" variant="outline" size="sm" onClick={create} disabled={save.isPending}>Crear</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/components/tasks/LabelChips.tsx frontend/src/components/tasks/LabelPicker.tsx
git commit -m "feat(front): chips y selector/creador de etiquetas"
```

### Task 11: `TaskPanel` (panel de tarjeta)

**Files:**
- Create: `frontend/src/components/tasks/TaskPanel.tsx`

- [ ] **Step 1: Crear `TaskPanel.tsx`** — recibe `taskId: string | null` y `onClose`. Usa `useTaskDetail(taskId)` y `useSaveTask()`. Renderiza dentro de `<Drawer>`:
  - Cabecera: título (input inline que guarda en blur), proyecto (`task.project?.name`).
  - `LabelChips` de las etiquetas actuales + `LabelPicker` (organizationId del task) que al cambiar hace `save.mutateAsync({ id, data: { labelIds } })`.
  - `Select` de estado, prioridad, responsable (`useAssignees`), e `Input type="date"` de inicio y vencimiento; cada cambio hace `save.mutateAsync({ id, data: { <campo> } })`.
  - `Textarea` de descripción (guarda en blur).
  - Secciones de Checklist y Actividad quedan como placeholders vacíos comentados `{/* Fase 2 */}` / `{/* Fase 3 */}` (NO se renderiza nada aún).

Estructura (los detalles de estilo siguen el patrón de `TaskForm`; reutiliza `Field`, `Select`, `Input`, `Textarea`):
```typescript
import { useTaskDetail, useSaveTask } from '@/hooks/useTasks';
import { useAssignees } from '@/hooks/useAssignees';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LabelChips } from './LabelChips';
import { LabelPicker } from './LabelPicker';
import { priorityOptions, taskStatusOptions } from '@/lib/domain';

function toDateInput(v: string | null | undefined) { return v ? v.slice(0, 10) : ''; }

export function TaskPanel({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data: task } = useTaskDetail(taskId);
  const save = useSaveTask();
  const { data: assignees } = useAssignees();
  const open = !!taskId;

  function patch(data: Record<string, unknown>) {
    if (task) save.mutate({ id: task.id, data });
  }

  return (
    <Drawer open={open} onClose={onClose} title={task?.title ?? 'Tarea'}>
      {!task ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <Field label="Título">
            <Input defaultValue={task.title} onBlur={(e) => e.target.value !== task.title && patch({ title: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1 text-xs text-[var(--color-muted-foreground)]">Etiquetas</p>
            <LabelChips labels={(task.labels ?? []).map((tl) => tl.label)} />
            <div className="mt-2">
              <LabelPicker
                organizationId={task.organizationId}
                selected={(task.labels ?? []).map((tl) => tl.label.id)}
                onChange={(labelIds) => patch({ labelIds })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado"><Select options={taskStatusOptions} value={task.status} onChange={(e) => patch({ status: e.target.value })} /></Field>
            <Field label="Prioridad"><Select options={priorityOptions} value={task.priority} onChange={(e) => patch({ priority: e.target.value })} /></Field>
            <Field label="Responsable">
              <Select
                options={(assignees ?? []).map((u) => ({ value: u.id, label: u.name }))}
                placeholder="Sin asignar" value={task.ownerId ?? ''} onChange={(e) => patch({ ownerId: e.target.value || null })}
              />
            </Field>
            <div />
            <Field label="Inicio"><Input type="date" defaultValue={toDateInput(task.startDate)} onChange={(e) => patch({ startDate: e.target.value || null })} /></Field>
            <Field label="Vencimiento"><Input type="date" defaultValue={toDateInput(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} /></Field>
          </div>
          <Field label="Descripción">
            <Textarea defaultValue={task.description ?? ''} onBlur={(e) => e.target.value !== (task.description ?? '') && patch({ description: e.target.value || null })} />
          </Field>
          {/* Fase 2: Checklist */}
          {/* Fase 3: Actividad y comentarios */}
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/components/tasks/TaskPanel.tsx
git commit -m "feat(front): TaskPanel (panel de tarjeta con etiquetas, controles y descripción)"
```

### Task 12: Abrir el panel por `?tarea=<id>` y búsqueda en TasksPage

**Files:**
- Modify: `frontend/src/pages/tasks/TasksPage.tsx`

- [ ] **Step 1: Leer/escribir el query param** — importar `useSearchParams` de `react-router-dom` y `TaskPanel`. En el componente:
```typescript
import { useSearchParams } from 'react-router-dom';
import { TaskPanel } from '@/components/tasks/TaskPanel';
// ...
  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskId = searchParams.get('tarea');
  function openTask(id: string) { setSearchParams((p) => { p.set('tarea', id); return p; }); }
  function closeTask() { setSearchParams((p) => { p.delete('tarea'); return p; }); }
```

- [ ] **Step 2: Abrir el panel al clicar una fila/tarjeta** — en la fila de la tabla y en la tarjeta Kanban, el clic (fuera de los botones de acción) llama `openTask(task.id)`. Para la tabla, hacer la celda del título clicable:
```tsx
<td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
  <button className="text-left hover:underline" onClick={() => openTask(task.id)}>{task.title}</button>
</td>
```
Y renderizar el panel al final del JSX (antes de cerrar el fragmento):
```tsx
<TaskPanel taskId={openTaskId} onClose={closeTask} />
```

- [ ] **Step 3: Añadir buscador de texto** — un `<Input>` en la barra de filtros que setea `filters.search` (debounce simple con estado local + efecto, o directo). Añadir al grid de filtros:
```tsx
<Input
  placeholder="Buscar tareas…"
  value={filters.search ?? ''}
  onChange={(e) => set('search', e.target.value)}
/>
```
(`set` ya existe y hace `value || undefined`.) Importar `Input`.

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS y build de Vite exitoso.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tasks/TasksPage.tsx
git commit -m "feat(front): abrir panel de tarjeta por ?tarea y búsqueda en Tareas"
```

### Task 13: Tarjeta rica (`TaskCard`) y fecha de inicio en el form

**Files:**
- Modify: `frontend/src/pages/tasks/TaskCard.tsx`
- Modify: `frontend/src/pages/tasks/BoardColumn.tsx` (encadenar `onOpenTask`)
- Modify: `frontend/src/pages/tasks/TaskBoard.tsx` (encadenar `onOpenTask`)
- Modify: `frontend/src/pages/tasks/TasksPage.tsx` (pasar `onOpenTask={(t) => openTask(t.id)}` al `TaskBoard`)
- Modify: `frontend/src/pages/tasks/TaskForm.tsx`

- [ ] **Step 1: Enriquecer `TaskCard`** — mostrar chips de etiqueta arriba y las iniciales del responsable abajo. Añadir imports `LabelChips` y el tipo; el clic en el **cuerpo** de la tarjeta abre el panel (nueva prop `onOpen: (task) => void`). Estructura: sobre el título, `{task.labels?.length ? <LabelChips labels={task.labels.map(tl=>tl.label)} /> : null}`; en la fila inferior junto a prioridad/fecha, un círculo con iniciales de `task.owner?.name`.
  - **Clic en el cuerpo abre el panel**: envolver el contenido clicable con `onClick={() => onOpen(task)}`.
  - **IMPORTANTE — evitar burbujeo**: los botones Editar/Eliminar viven dentro de la tarjeta; añadir `e.stopPropagation()` en sus `onClick` (`onClick={(e) => { e.stopPropagation(); onEdit(task); }}` y análogo para eliminar) para que clicar acción NO abra también el panel. El `draggable`/`onDragStart` se mantiene.

- [ ] **Step 2: Encadenar la prop `onOpenTask`** — `TaskBoard` y `BoardColumn` reciben `onOpenTask: (task: Task) => void` y lo pasan hacia abajo hasta `TaskCard` como `onOpen`. En `TasksPage`, al renderizar `<TaskBoard>`, pasar `onOpenTask={(t) => openTask(t.id)}`.

- [ ] **Step 3: Fecha de inicio en `TaskForm`** — añadir un `<Field label="Inicio">` con `<Input type="date">` ligado a `form.startDate` (nuevo en el estado y en el payload `base`), junto al campo de Vencimiento existente. El selector de etiquetas en el form es opcional en Fase 1 (el panel ya las gestiona); si se añade, usar `LabelPicker` con `form.organizationId`.

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tasks/TaskCard.tsx frontend/src/pages/tasks/BoardColumn.tsx frontend/src/pages/tasks/TaskBoard.tsx frontend/src/pages/tasks/TasksPage.tsx frontend/src/pages/tasks/TaskForm.tsx
git commit -m "feat(front): tarjeta con etiquetas y responsable + fecha de inicio en el form"
```

---

## Chunk 4: Frontend — integración proyecto ↔ tareas (Fase 1)

### Task 14: Extraer vista de tabla de tareas reutilizable

**Files:**
- Create: `frontend/src/components/tasks/TasksTableView.tsx`
- Modify: `frontend/src/pages/tasks/TasksPage.tsx`

- [ ] **Step 1: Extraer la tabla** de `TasksPage` a un componente `TasksTableView` que recibe `tasks: Task[]`, `onOpen`, `onQuickStatus`, `onEdit`, `onDelete`. Es un movimiento de JSX sin cambio de comportamiento (la tabla con columnas Tarea/Empresa/Proyecto/Responsable/Estado/Prioridad/Vence/Acciones). `TasksPage` pasa a renderizar `<TasksTableView ... />`.

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS; la página de Tareas se comporta igual que antes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tasks/TasksTableView.tsx frontend/src/pages/tasks/TasksPage.tsx
git commit -m "refactor(front): extraer TasksTableView reutilizable"
```

### Task 15: `ProjectDetailPage` con lista + tablero + panel

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDetailPage.tsx`

- [ ] **Step 1: Reemplazar la lista pobre de tareas** por las vistas reutilizables acotadas al proyecto. En vez de leer `project.tasks` embebidas, usar `useTasks({ projectId: id, search })` para poder buscar y refrescar. Añadir:
  - Estado `view: 'lista' | 'kanban'` con dos botones (igual que TasksPage).
  - Buscador (`<Input>` que setea `search`).
  - `TasksTableView` (vista lista) y `TaskBoard` (vista kanban) alimentados por las tareas del proyecto.
  - Apertura del panel por `?tarea=<id>` (mismo patrón `useSearchParams` + `<TaskPanel>`).
  - El botón "Nueva tarea" sigue abriendo `TaskForm` con `lockContext` al proyecto.

> **Rules-of-hooks**: `ProjectDetailPage` tiene early returns (`Spinner`/`ErrorState`) alrededor de las líneas 31-33. Los nuevos hooks (`useTasks`, `useSearchParams`, `useState`) deben declararse **antes** de esos returns. La cabecera de avance puede seguir leyendo `project.tasks` embebidas (duplicación inofensiva con la query `useTasks`).

- [ ] **Step 2: Mantener la cabecera del proyecto** (info, avance, próxima acción/riesgos/descripción) tal cual; solo cambia la sección de tareas.

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/projects/ProjectDetailPage.tsx
git commit -m "feat(front): detalle de proyecto con lista+tablero de tareas y panel"
```

---

## Verificación final Fase 1 (smoke manual)

- [ ] Backend (`npm run dev`) + frontend (`npm run dev`), login CEO.
- [ ] En Tareas: crear etiquetas de colores, asignarlas a una tarea desde el panel, ver los chips en la tarjeta.
- [ ] Buscar tareas por texto (título/descripción).
- [ ] Abrir una tarjeta → el panel se desliza desde la derecha; cambiar estado/responsable/fechas/etiquetas se guarda al vuelo; la URL lleva `?tarea=<id>` y es recargable.
- [ ] Entrar a un proyecto: ver sus tareas en lista y en tablero, buscar, y abrir el mismo panel; crear una tarea nueva queda ligada al proyecto.
- [ ] Colaborador: puede gestionar etiquetas y usar el panel (rutas `/labels`, `/tasks` son de todos los roles).

---

## Fases 2 y 3 (alcance — plan propio al llegar)

Cada fase recibirá su propio plan detallado tras mergear la anterior, con su migración, tests y verificación.

### Fase 2 — Checklist / subtareas
- **Backend**: modelo `ChecklistItem` (`id, taskId, text, done, position`) + migración; `modules/tasks/checklist.service.ts` + rutas `POST /tasks/:id/checklist`, `PATCH /tasks/:id/checklist/:itemId` (toggle/renombrar/mover), `DELETE`; `getById` incluye `checklistItems` (orden por `position`) y el `list` un `_count` de ítems totales y completados (`_count: { select: { checklistItems: { where: { done: true } } } }` + total) para el progreso.
- **Frontend**: sección Checklist en `TaskPanel` (añadir/marcar/borrar/reordenar con barra de progreso); indicador `✔ 2/5` en `TaskCard`; hooks de mutación de checklist.

### Fase 3 — Actividad + comentarios
- **Backend**: modelos `TaskComment` (`authorId→User`) y `TaskActivity` (`actorId→User?`, enum `TaskActivityType`, `data Json`) + migración; paso de `req.user.id` a `tasks.service` (`create(input, actorId?)`, `update(id, input, actorId?)` — opcional para no romper el agente, que pasa `null`); helper `recordActivity(tx, ...)` que compara estado previo/nuevo (ampliar el `select` de `current` a `status/dueDate/startDate/ownerId` + labels); `modules/tasks/comments.service.ts` + rutas `GET/POST /tasks/:id/comments`; `GET /tasks/:id/activity` (o incluido en `getById`).
- **Frontend**: feed "Actividad y comentarios" en `TaskPanel` (caja de comentario + lista cronológica intercalada); hooks de comentarios/actividad.
- **Nota de tests**: actualizar el comentario de `resetDb` en `backend/test/db.ts` para listar las nuevas tablas hijas (el `TRUNCATE ... CASCADE` desde `organizations`/`users` ya las cubre funcionalmente).
