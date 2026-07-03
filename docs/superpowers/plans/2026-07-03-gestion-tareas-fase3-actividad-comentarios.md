# Gestión de tareas — Fase 3: Actividad + comentarios — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar automáticamente los cambios clave de una tarea (creación, estado, responsable, fechas, proyecto, etiquetas) y permitir comentarios de usuarios, mostrados en un feed cronológico único en el panel de tarjeta.

**Architecture:** Backend Express + Prisma: modelos `TaskComment` (autor) y `TaskActivity` (actor opcional, `type` enum, `data` JSON). Los services de tasks reciben `actorId?` desde el controller (`req.user.id`) y registran actividad **dentro de la misma transacción** vía `recordActivity`, comparando el estado previo con el nuevo. Comentarios en un módulo propio. El detalle (`getById`) incluye comentarios y actividad para alimentar el feed. Frontend: sección "Actividad y comentarios" en el `TaskPanel`.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, Vitest, React + TanStack Query. Sin nuevas dependencias.

**Spec:** `docs/superpowers/specs/2026-07-03-gestion-tareas-rica-integrada-design.md` (Fase 3).

**Prerequisito:** Fases 1 y 2 mergeadas.

**Verificación global:** backend `npm run build` + `npm test`; frontend `npm run lint` + `npm run build`. Repoblar dev con `npm run prisma:seed` si está vacía antes del smoke.

---

## Mapa de archivos

**Backend — crear:**
- `backend/src/modules/tasks/task-activity.service.ts` — `recordActivity` + `diffScalarEvents`.
- `backend/src/modules/tasks/comments.schema.ts` — Zod del comentario.
- `backend/src/modules/tasks/comments.service.ts` — list/create comentarios.
- `backend/src/modules/tasks/comments.controller.ts` — controllers.
- `backend/test/task-activity.service.test.ts` — tests de actividad.
- `backend/test/comments.service.test.ts` — tests de comentarios.

**Backend — modificar:**
- `backend/prisma/schema.prisma` — enum `TaskActivityType`, modelos `TaskComment`/`TaskActivity`, back-relations en `Task` y `User`.
- `backend/prisma/migrations/<ts>_actividad_comentarios/migration.sql` — migración aditiva (enum + 2 tablas).
- `backend/src/modules/tasks/tasks.service.ts` — `create(input, actorId?)`, `update(id, input, actorId?)`, registro de actividad, `current` ampliado, include de `comments`/`activity` en `getById`.
- `backend/src/modules/tasks/tasks.controller.ts` — pasar `req.user?.id`.
- `backend/src/modules/tasks/tasks.routes.ts` — rutas de comentarios.
- `backend/test/db.ts` — actualizar comentario de `resetDb` (cosmético).

**Frontend — crear:**
- `frontend/src/hooks/useComments.ts` — `useAddComment`.
- `frontend/src/components/tasks/ActivityFeed.tsx` — feed intercalado + caja de comentario.
- `frontend/src/lib/taskActivity.ts` — texto legible por tipo de actividad.

**Frontend — modificar:**
- `frontend/src/types/core.ts` — `TaskComment`, `TaskActivity`, `TaskActivityType`; `TaskDetail.comments`/`.activity`.
- `frontend/src/types/domain.ts` — re-exportar.
- `frontend/src/components/tasks/TaskPanel.tsx` — montar `ActivityFeed`.

---

## Chunk 1: Backend — modelos y migración

### Task 1: Schema Prisma — enum + `TaskComment` + `TaskActivity`

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Back-relations en `Task`** — en `model Task`, junto a `checklistItems ChecklistItem[]`, añadir:
```prisma
  comments       TaskComment[]
  activity       TaskActivity[]
```

- [ ] **Step 2: Back-relations en `User`** — en `model User`, junto a `ownedProjects Project[] @relation("ProjectOwner")`, añadir:
```prisma
  taskComments  TaskComment[]  @relation("CommentAuthor")
  taskActivity  TaskActivity[] @relation("ActivityActor")
```

- [ ] **Step 3: Enum + modelos** — tras `model ChecklistItem { ... }`, añadir:
```prisma
enum TaskActivityType {
  CREATED
  STATUS_CHANGED
  ASSIGNED
  DUE_DATE_CHANGED
  START_DATE_CHANGED
  LABEL_ADDED
  LABEL_REMOVED
  MOVED_PROJECT
}

/// Comentario manual de un usuario sobre una tarea.
model TaskComment {
  id        String   @id @default(cuid())
  taskId    String
  authorId  String
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@map("task_comments")
}

/// Evento de historial (auto-registrado) sobre una tarea.
model TaskActivity {
  id        String           @id @default(cuid())
  taskId    String
  actorId   String?
  type      TaskActivityType
  data      Json?
  createdAt DateTime         @default(now())

  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actor User? @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([taskId])
  @@map("task_activity")
}
```

- [ ] **Step 4: Validar**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(back): modelos TaskComment/TaskActivity + enum en schema"
```

### Task 2: Migración aditiva (enum + 2 tablas)

**Files:**
- Create: `backend/prisma/migrations/20260703140000_actividad_comentarios/migration.sql`

- [ ] **Step 1: Escribir la migración** (aditiva; a mano + `migrate deploy`):

`backend/prisma/migrations/20260703140000_actividad_comentarios/migration.sql`:
```sql
CREATE TYPE "TaskActivityType" AS ENUM (
  'CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'DUE_DATE_CHANGED',
  'START_DATE_CHANGED', 'LABEL_ADDED', 'LABEL_REMOVED', 'MOVED_PROJECT'
);

CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_comments_taskId_idx" ON "task_comments"("taskId");

CREATE TABLE "task_activity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "TaskActivityType" NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_activity_taskId_idx" ON "task_activity"("taskId");

ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 2: Aplicar a dev + regenerar + aplicar a test**

Run: `cd backend && npx prisma migrate deploy && npm run prisma:generate && npm run test:db:setup`
Expected: aplica `20260703140000_actividad_comentarios` a dev y `vitamcore_test`, cliente regenerado.

- [ ] **Step 3: Verificar las tablas**

Run: `docker exec vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT to_regclass('public.task_comments'), to_regclass('public.task_activity');"`
Expected: ambas no `NULL`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/migrations
git commit -m "feat(back): migración task_comments + task_activity"
```

---

## Chunk 2: Backend — registro de actividad y comentarios

### Task 3: `recordActivity` y diff de eventos

**Files:**
- Create: `backend/src/modules/tasks/task-activity.service.ts`
- Test: `backend/test/task-activity.service.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `backend/test/task-activity.service.test.ts` (prueba la función pura `diffScalarEvents`):

```typescript
import { describe, expect, test } from 'vitest';
import { diffScalarEvents } from '../src/modules/tasks/task-activity.service';

const base = {
  status: 'TODO' as const,
  ownerId: null as string | null,
  projectId: null as string | null,
  dueDate: null as Date | null,
  startDate: null as Date | null,
};

describe('diffScalarEvents', () => {
  test('sin cambios => []', () => {
    expect(diffScalarEvents(base, {})).toEqual([]);
  });

  test('cambio de estado => STATUS_CHANGED con from/to', () => {
    const events = diffScalarEvents(base, { status: 'DOING' });
    expect(events).toEqual([{ type: 'STATUS_CHANGED', data: { from: 'TODO', to: 'DOING' } }]);
  });

  test('reasignar => ASSIGNED', () => {
    const events = diffScalarEvents(base, { ownerId: 'u1' });
    expect(events.map((e) => e.type)).toEqual(['ASSIGNED']);
  });

  test('mismo valor enviado no genera evento', () => {
    expect(diffScalarEvents({ ...base, status: 'DOING' }, { status: 'DOING' })).toEqual([]);
  });

  test('cambio de fechas y proyecto', () => {
    const events = diffScalarEvents(base, {
      dueDate: new Date('2026-08-01'),
      startDate: new Date('2026-07-01'),
      projectId: 'p1',
    });
    expect(events.map((e) => e.type).sort()).toEqual(
      ['DUE_DATE_CHANGED', 'MOVED_PROJECT', 'START_DATE_CHANGED'].sort(),
    );
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/task-activity.service.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar `task-activity.service.ts`**

```typescript
import { Prisma, TaskActivityType } from '@prisma/client';
import type { TaskStatus } from '@prisma/client';

export type ActivityEvent = { type: TaskActivityType; data?: Prisma.InputJsonValue };

type ScalarState = {
  status: TaskStatus;
  ownerId: string | null;
  projectId: string | null;
  dueDate: Date | null;
  startDate: Date | null;
};

function sameTime(a: Date | null | undefined, b: Date | null | undefined) {
  return (a ? a.getTime() : null) === (b ? b.getTime() : null);
}

/**
 * Compara el estado previo con los campos enviados en un update y devuelve
 * los eventos de actividad que corresponden. Solo mira los campos presentes
 * en `input` (partial): un campo ausente nunca genera evento.
 */
export function diffScalarEvents(prev: ScalarState, input: Partial<ScalarState>): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  if ('status' in input && input.status !== undefined && input.status !== prev.status) {
    events.push({ type: TaskActivityType.STATUS_CHANGED, data: { from: prev.status, to: input.status } });
  }
  if ('ownerId' in input && (input.ownerId ?? null) !== prev.ownerId) {
    events.push({ type: TaskActivityType.ASSIGNED, data: {} });
  }
  if ('projectId' in input && (input.projectId ?? null) !== prev.projectId) {
    events.push({ type: TaskActivityType.MOVED_PROJECT, data: {} });
  }
  if ('dueDate' in input && !sameTime(input.dueDate, prev.dueDate)) {
    events.push({ type: TaskActivityType.DUE_DATE_CHANGED, data: {} });
  }
  if ('startDate' in input && !sameTime(input.startDate, prev.startDate)) {
    events.push({ type: TaskActivityType.START_DATE_CHANGED, data: {} });
  }
  return events;
}

/** Escribe los eventos de actividad dentro de la transacción dada. */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  taskId: string,
  actorId: string | null | undefined,
  events: ActivityEvent[],
) {
  if (events.length === 0) return;
  await tx.taskActivity.createMany({
    data: events.map((e) => ({
      taskId,
      actorId: actorId ?? null,
      type: e.type,
      data: e.data ?? Prisma.JsonNull,
    })),
  });
}
```

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `cd backend && npx vitest run test/task-activity.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tasks/task-activity.service.ts backend/test/task-activity.service.test.ts
git commit -m "feat(back): recordActivity + diffScalarEvents"
```

### Task 4: Registrar actividad en create/update + include en getById

**Files:**
- Modify: `backend/src/modules/tasks/tasks.service.ts`
- Modify: `backend/src/modules/tasks/tasks.controller.ts`
- Test: `backend/test/task-activity.service.test.ts` (añadir casos de integración)

- [ ] **Step 1: Añadir tests de integración**. Primero, **mover los imports al inicio del archivo** (junto a los de Task 3) para no intercalarlos: la cabecera queda así:

```typescript
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser, makeTask } from './fixtures';
import { diffScalarEvents } from '../src/modules/tasks/task-activity.service';
import * as tasks from '../src/modules/tasks/tasks.service';
import { prisma } from '../src/lib/prisma';
```

Luego, **al final del archivo** (tras el `describe('diffScalarEvents', ...)` existente), añadir el bloque de integración:

```typescript
beforeEach(resetDb);
afterAll(disconnect);

describe('actividad — integración', () => {
  test('create registra CREATED con actor', async () => {
    const org = await makeOrg();
    const user = await makeUser();
    await tasks.create({ organizationId: org.id, title: 'T', status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never, user.id);
    const detail = await tasks.getById((await prisma.task.findFirst())!.id);
    expect(detail.activity.map((a: { type: string }) => a.type)).toContain('CREATED');
    expect(detail.activity[detail.activity.length - 1].actorId).toBe(user.id);
  });

  test('update de estado registra STATUS_CHANGED', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id, { status: 'TODO' });
    await tasks.update(task.id, { status: 'DOING' } as never, null);
    const detail = await tasks.getById(task.id);
    expect(detail.activity.map((a: { type: string }) => a.type)).toContain('STATUS_CHANGED');
  });

  test('actorId opcional (agente pasa undefined) => actividad con actorId null', async () => {
    const org = await makeOrg();
    await tasks.create({ organizationId: org.id, title: 'IA', status: 'TODO', priority: 'MEDIUM', source: 'AI' } as never);
    const detail = await tasks.getById((await prisma.task.findFirst())!.id);
    expect(detail.activity[0].actorId).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/task-activity.service.test.ts`
Expected: FAIL — `create`/`update` no aceptan `actorId` y `getById` no incluye `activity`.

- [ ] **Step 3: Modificar `tasks.service.ts`** — importar los helpers:
```typescript
import { diffScalarEvents, recordActivity } from './task-activity.service';
import { TaskActivityType } from '@prisma/client';
```

En `getById`, añadir al `include` (tras `checklistItems: ...`):
```typescript
      comments: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      activity: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
```

Cambiar la firma de `create` y registrar CREATED:
```typescript
export async function create(input: CreateTaskInput, actorId?: string | null) {
```
Dentro de la transacción, tras crear la tarea (y sus labels), antes del `syncProjectStatus`, añadir:
```typescript
    await recordActivity(tx, task.id, actorId, [{ type: TaskActivityType.CREATED, data: {} }]);
```

Cambiar la firma de `update`, ampliar el `select` de `current`, y registrar los eventos:
```typescript
export async function update(id: string, input: UpdateTaskInput, actorId?: string | null) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true, organizationId: true, projectId: true,
      status: true, ownerId: true, dueDate: true, startDate: true,
      labels: { select: { labelId: true } },
    },
  });
```
> Conservar la guarda existente inmediatamente después: `if (!current) throw notFound('Tarea no encontrada');` (además de habilitar el acceso a `current.status/...`).

Dentro de la transacción, tras aplicar los cambios de labels y **antes** de `return task`, calcular y registrar los eventos:
```typescript
    const events = diffScalarEvents(
      { status: current.status, ownerId: current.ownerId, projectId: current.projectId, dueDate: current.dueDate, startDate: current.startDate },
      data,
    );
    if (labelIds) {
      const prevIds = new Set(current.labels.map((l) => l.labelId));
      const nextIds = new Set(labelIds);
      const added = [...nextIds].filter((x) => !prevIds.has(x));
      const removed = [...prevIds].filter((x) => !nextIds.has(x));
      if (added.length || removed.length) {
        const names = await tx.label.findMany({
          where: { id: { in: [...added, ...removed] } },
          select: { id: true, name: true },
        });
        const nameOf = (lid: string) => names.find((n) => n.id === lid)?.name ?? '';
        for (const lid of added) events.push({ type: TaskActivityType.LABEL_ADDED, data: { name: nameOf(lid) } });
        for (const lid of removed) events.push({ type: TaskActivityType.LABEL_REMOVED, data: { name: nameOf(lid) } });
      }
    }
    await recordActivity(tx, id, actorId, events);
```
> Nota: `data` (destructurado de `input`) es el objeto parcial con los campos escritos; `diffScalarEvents` solo mira las claves presentes. `current.status/ownerId/...` ya vienen del `select` ampliado.

- [ ] **Step 4: Modificar `tasks.controller.ts`** — pasar el actor:
```typescript
export async function createController(req: Request, res: Response) {
  const input = createTaskSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input, req.user?.id) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateTaskSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input, req.user?.id) });
}
```

- [ ] **Step 5: Ejecutar para verlo pasar + suite completa**

Run: `cd backend && npx vitest run test/task-activity.service.test.ts && npm run build && npm test`
Expected: los tests de actividad PASAN; build limpio (el agente `createTask({...})` sigue compilando porque `actorId` es opcional); **toda** la suite verde.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tasks/tasks.service.ts backend/src/modules/tasks/tasks.controller.ts backend/test/task-activity.service.test.ts
git commit -m "feat(back): registrar actividad en create/update + include en getById"
```

### Task 5: Módulo de comentarios

**Files:**
- Create: `backend/src/modules/tasks/comments.schema.ts`
- Create: `backend/src/modules/tasks/comments.service.ts`
- Create: `backend/src/modules/tasks/comments.controller.ts`
- Modify: `backend/src/modules/tasks/tasks.routes.ts`
- Test: `backend/test/comments.service.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `backend/test/comments.service.test.ts`:

```typescript
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser, makeTask } from './fixtures';
import * as comments from '../src/modules/tasks/comments.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('comments.service', () => {
  test('create adjunta autor y list lo devuelve (desc)', async () => {
    const org = await makeOrg();
    const user = await makeUser({ name: 'Ana' });
    const task = await makeTask(org.id);
    await comments.create(task.id, { body: 'Primero' } as never, user.id);
    await comments.create(task.id, { body: 'Segundo' } as never, user.id);
    const list = await comments.list(task.id);
    expect(list).toHaveLength(2);
    expect(list[0].body).toBe('Segundo'); // más reciente primero
    expect(list[0].author.name).toBe('Ana');
  });

  test('create sobre tarea inexistente => notFound (404)', async () => {
    const user = await makeUser();
    await expect(
      comments.create('no-existe', { body: 'X' } as never, user.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/comments.service.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar `comments.schema.ts`**

```typescript
import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'El comentario no puede estar vacío').max(5000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
```

- [ ] **Step 4: Implementar `comments.service.ts`**

```typescript
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { CreateCommentInput } from './comments.schema';

const withAuthor = {
  include: { author: { select: { id: true, name: true } } },
} as const;

export function list(taskId: string) {
  return prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    ...withAuthor,
  });
}

export async function create(taskId: string, input: CreateCommentInput, authorId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw notFound('Tarea no encontrada');
  return prisma.taskComment.create({
    data: { taskId, authorId, body: input.body },
    ...withAuthor,
  });
}
```

- [ ] **Step 5: Ejecutar para verlo pasar**

Run: `cd backend && npx vitest run test/comments.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implementar `comments.controller.ts`**

```typescript
import type { Request, Response } from 'express';
import { createCommentSchema } from './comments.schema';
import * as service from './comments.service';

export async function listCommentsController(req: Request, res: Response) {
  res.json({ data: await service.list(req.params.id) });
}
export async function createCommentController(req: Request, res: Response) {
  const input = createCommentSchema.parse(req.body);
  res.status(201).json({ data: await service.create(req.params.id, input, req.user!.id) });
}
```

- [ ] **Step 7: Añadir las rutas** en `tasks.routes.ts` — importar los controllers de comentarios y añadir tras las rutas de checklist:
```typescript
import { listCommentsController, createCommentController } from './comments.controller';
// ...
tasksRouter.get('/:id/comments', asyncHandler(listCommentsController));
tasksRouter.post('/:id/comments', asyncHandler(createCommentController));
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/tasks/comments.schema.ts backend/src/modules/tasks/comments.service.ts backend/src/modules/tasks/comments.controller.ts backend/src/modules/tasks/tasks.routes.ts backend/test/comments.service.test.ts
git commit -m "feat(back): comentarios de tarea (GET/POST /tasks/:id/comments)"
```

### Task 6: Actualizar comentario de `resetDb`

**Files:**
- Modify: `backend/test/db.ts`

- [ ] **Step 1: Actualizar el comentario** que enumera las tablas hijas cubiertas por el CASCADE, para incluir las nuevas de Fases 1-3 (`labels`, `task_labels`, `checklist_items`, `task_comments`, `task_activity`). No cambia el SQL del `TRUNCATE` (el CASCADE desde `organizations`/`users` ya las cubre).

- [ ] **Step 2: Verificar suite + commit**

Run: `cd backend && npm test`
Expected: verde.
```bash
git add backend/test/db.ts
git commit -m "docs(test): actualizar comentario de resetDb con tablas nuevas"
```

---

## Chunk 3: Frontend — feed de actividad y comentarios

### Task 7: Tipos y texto de actividad

**Files:**
- Modify: `frontend/src/types/core.ts`
- Modify: `frontend/src/types/domain.ts`
- Create: `frontend/src/lib/taskActivity.ts`

- [ ] **Step 1: Tipos en `core.ts`**:
```typescript
export type TaskActivityType =
  | 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'DUE_DATE_CHANGED'
  | 'START_DATE_CHANGED' | 'LABEL_ADDED' | 'LABEL_REMOVED' | 'MOVED_PROJECT';

export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: Ref | null;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  type: TaskActivityType;
  data: Record<string, unknown> | null;
  createdAt: string;
  actor: Ref | null;
}
```
En `interface TaskDetail`, añadir:
```typescript
  comments: TaskComment[];
  activity: TaskActivity[];
```

- [ ] **Step 2: Re-exportar** `TaskComment`, `TaskActivity`, `TaskActivityType` en `types/domain.ts`.

- [ ] **Step 3: Texto legible** — `frontend/src/lib/taskActivity.ts`:
```typescript
import { taskStatus } from '@/lib/domain';
import type { TaskActivity, TaskStatus } from '@/types/domain';

export function activityText(a: TaskActivity): string {
  const d = a.data ?? {};
  switch (a.type) {
    case 'CREATED': return 'creó la tarea';
    case 'STATUS_CHANGED': {
      const to = (d.to as TaskStatus) ?? undefined;
      return to ? `cambió el estado a ${taskStatus[to]?.label ?? to}` : 'cambió el estado';
    }
    case 'ASSIGNED': return 'cambió el responsable';
    case 'DUE_DATE_CHANGED': return 'cambió el vencimiento';
    case 'START_DATE_CHANGED': return 'cambió la fecha de inicio';
    case 'LABEL_ADDED': return `añadió la etiqueta “${d.name ?? ''}”`;
    case 'LABEL_REMOVED': return `quitó la etiqueta “${d.name ?? ''}”`;
    case 'MOVED_PROJECT': return 'movió la tarea de proyecto';
    default: return 'actualizó la tarea';
  }
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/types/core.ts frontend/src/types/domain.ts frontend/src/lib/taskActivity.ts
git commit -m "feat(front): tipos de actividad/comentarios + texto legible"
```

### Task 8: Hook `useComments`

**Files:**
- Create: `frontend/src/hooks/useComments.ts`

- [ ] **Step 1: Crear el hook** (solo add; el feed llega por `getById`):
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post(`/tasks/${taskId}/comments`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] }),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/hooks/useComments.ts
git commit -m "feat(front): hook useAddComment"
```

### Task 9: `ActivityFeed` en el panel

**Files:**
- Create: `frontend/src/components/tasks/ActivityFeed.tsx`
- Modify: `frontend/src/components/tasks/TaskPanel.tsx`

- [ ] **Step 1: Crear `ActivityFeed.tsx`** — caja de comentario + lista cronológica intercalada (comentarios y actividad), ordenada por `createdAt` desc:
```typescript
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAddComment } from '@/hooks/useComments';
import { activityText } from '@/lib/taskActivity';
import { formatDate } from '@/lib/domain';
import type { TaskComment, TaskActivity } from '@/types/domain';

type Entry =
  | { kind: 'comment'; at: string; c: TaskComment }
  | { kind: 'activity'; at: string; a: TaskActivity };

export function ActivityFeed({
  taskId,
  comments,
  activity,
}: {
  taskId: string;
  comments: TaskComment[];
  activity: TaskActivity[];
}) {
  const add = useAddComment(taskId);
  const [body, setBody] = useState('');

  const entries: Entry[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })),
    ...activity.map((a) => ({ kind: 'activity' as const, at: a.createdAt, a })),
  ].sort((x, y) => (x.at < y.at ? 1 : -1));

  function submit() {
    if (!body.trim()) return;
    add.mutate(body.trim());
    setBody('');
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
        Actividad y comentarios
      </p>
      <div className="mb-3 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un comentario…" />
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={submit} disabled={add.isPending}>
            Comentar
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {entries.map((e) =>
          e.kind === 'comment' ? (
            <li key={`c-${e.c.id}`} className="rounded-md bg-[var(--color-muted)]/40 p-2 text-sm">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {e.c.author?.name ?? 'Alguien'} · {formatDate(e.c.createdAt)}
              </p>
              <p className="whitespace-pre-line text-[var(--color-foreground)]">{e.c.body}</p>
            </li>
          ) : (
            <li key={`a-${e.a.id}`} className="px-2 text-xs text-[var(--color-muted-foreground)]">
              • {e.a.actor?.name ?? 'IA'} {activityText(e.a)} · {formatDate(e.a.createdAt)}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Montar en `TaskPanel`** — reemplazar el comentario `{/* Fase 3: Actividad y comentarios */}` por:
```tsx
          <ActivityFeed taskId={task.id} comments={task.comments ?? []} activity={task.activity ?? []} />
```
y añadir el import: `import { ActivityFeed } from './ActivityFeed';`.
> Nota: `task.comments`/`task.activity` existen en `TaskDetail` (getById). Con `?? []` el panel no rompe si están ausentes.

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tasks/ActivityFeed.tsx frontend/src/components/tasks/TaskPanel.tsx
git commit -m "feat(front): feed de actividad y comentarios en el panel"
```

---

## Verificación final Fase 3 (smoke manual + E2E)

- [ ] `npm run prisma:seed` si dev está vacía. Backend + frontend, login CEO.
- [ ] Abrir una tarea → sección "Actividad y comentarios": escribir un comentario aparece en el feed con autor y fecha.
- [ ] Cambiar estado/responsable/fecha desde el panel → aparecen líneas de actividad ("cambió el estado a …", etc.) intercaladas con los comentarios, más reciente arriba.
- [ ] Añadir/quitar una etiqueta → "añadió/quitó la etiqueta X".
- [ ] E2E backend: `POST /tasks/:id/comments` (201, con autor); `create` registra `CREATED`; `update` de estado registra `STATUS_CHANGED`; comentario sobre tarea inexistente → 404.
