# Múltiples responsables por tarea — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una `Task` tenga cero, uno o varios responsables (set plano), reemplazando el `ownerId` único por una tabla intermedia `TaskAssignee`, sin perder datos existentes.

**Architecture:** Se replica el patrón many-to-many que ya usan las etiquetas (`TaskLabel` + `LabelPicker`). En backend, la relación se maneja con `deleteMany` + `createMany` dentro de la transacción de create/update, y la actividad emite `ASSIGNEE_ADDED`/`ASSIGNEE_REMOVED`. En frontend, un `AssigneePicker` (chips toggle) y un `AssigneeAvatars` (avatares apilados) reemplazan el `Select` único. Los proyectos no se tocan.

**Tech Stack:** Express + Prisma + PostgreSQL (backend, Vitest contra BD real); React + Vite + TanStack Query (frontend, verificación por typecheck).

**Spec:** `docs/superpowers/specs/2026-07-06-multiples-responsables-tareas-design.md`

**Verificación global:** backend `cd backend && npm run build` + `npm test`; frontend `cd frontend && npm run lint`.

---

## Estructura de archivos

**Backend**
- Modificar: `backend/prisma/schema.prisma` (modelos `Task`, `User`, enum `TaskActivityType`; nuevo modelo `TaskAssignee`)
- Crear: `backend/prisma/migrations/<timestamp>_task_assignees/migration.sql` (hand-edited)
- Modificar: `backend/src/modules/shared/relations.ts` (nuevo `assertAssignableUsers`)
- Modificar: `backend/src/modules/tasks/tasks.schema.ts` (`assigneeIds`, `assigneeId`)
- Modificar: `backend/src/modules/tasks/tasks.service.ts` (create/update/list/getById + diff de actividad)
- Modificar: `backend/src/modules/tasks/task-activity.service.ts` (`ScalarState` sin `ownerId`)
- Modificar: `backend/src/modules/agent/agent.service.ts` (quitar `ownerId: null`)
- Modificar: `backend/test/tasks.service.test.ts`, `backend/test/task-activity.service.test.ts`

**Frontend**
- Modificar: `frontend/src/types/core.ts` (`Task`, `TaskActivityType`)
- Crear: `frontend/src/components/tasks/AssigneePicker.tsx`
- Crear: `frontend/src/components/tasks/AssigneeAvatars.tsx`
- Modificar: `frontend/src/pages/tasks/TaskForm.tsx`, `frontend/src/components/tasks/TaskPanel.tsx`, `frontend/src/pages/tasks/TaskCard.tsx`, `frontend/src/components/tasks/TasksTableView.tsx`, `frontend/src/pages/tasks/TasksPage.tsx`, `frontend/src/hooks/useTasks.ts`, `frontend/src/lib/taskActivity.ts`

---

## Chunk 1: Base de datos (schema + migración sin pérdida de datos)

### Task 1: Respaldo previo de la base de datos

**Files:** ninguno (operación de infraestructura)

- [ ] **Step 1: Verificar que la BD está corriendo**

Run: `docker compose ps`
Expected: el servicio `postgres` (`vitamcore-postgres`) aparece `running`/`healthy`. Si no, `docker compose up -d`.

- [ ] **Step 2: Volcar un respaldo completo antes de tocar nada**

Run (desde la raíz del repo):
```bash
docker compose exec -T postgres pg_dump -U postgres vitamcore > backup-antes-task-assignees.sql
```
Expected: se crea `backup-antes-task-assignees.sql` con tamaño > 0. Verificar con `ls -lh backup-antes-task-assignees.sql`. **Este archivo es la red de seguridad; no continuar sin él.**

- [ ] **Step 3: Anotar el conteo de tareas con responsable (para verificación posterior)**

Run:
```bash
docker compose exec -T postgres psql -U postgres -d vitamcore -c "SELECT count(*) FROM tasks WHERE \"ownerId\" IS NOT NULL;"
```
Expected: un número N (posiblemente 0 si la data local es sintética). Anotar N; después de migrar, `task_assignees` debe tener exactamente N filas.

---

### Task 2: Editar el schema de Prisma

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Añadir el modelo `TaskAssignee`**

Añadir un nuevo modelo (colócalo junto a `TaskLabel`, o inmediatamente después del modelo `Task`):

```prisma
/// Responsable de una tarea. Relación N–N entre Task y User (set plano).
model TaskAssignee {
  taskId String
  userId String

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation("TaskAssignee", fields: [userId], references: [id], onDelete: Cascade)

  @@id([taskId, userId])
  @@index([userId])
  @@map("task_assignees")
}
```

- [ ] **Step 2: Modificar el modelo `Task`**

En `model Task`:
- **Eliminar** la línea `ownerId        String?`.
- **Eliminar** la línea `owner        User?         @relation("TaskOwner", fields: [ownerId], references: [id], onDelete: SetNull)`.
- **Eliminar** la línea `@@index([ownerId])`.
- **Añadir** dentro de las relaciones (junto a `labels TaskLabel[]`): `assignees      TaskAssignee[]`.

- [ ] **Step 3: Modificar el modelo `User`**

En `model User`:
- **Eliminar** la línea `ownedTasks    Task[]    @relation("TaskOwner")`.
- **Añadir**: `assignedTasks TaskAssignee[] @relation("TaskAssignee")`.
- **No tocar** `ownedProjects` (los proyectos siguen con responsable único).

- [ ] **Step 4: Ampliar el enum `TaskActivityType`**

En `enum TaskActivityType`, **añadir** dos valores (conservar todos los existentes, incluido `ASSIGNED`):
```prisma
  ASSIGNEE_ADDED
  ASSIGNEE_REMOVED
```

- [ ] **Step 5: Verificar que el schema es válido**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

---

### Task 3: Crear y editar la migración (copiar antes de borrar)

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_task_assignees/migration.sql`

- [ ] **Step 1: Generar la migración SIN aplicarla**

Run: `cd backend && npx prisma migrate dev --create-only --name task_assignees`
Expected: crea una carpeta `prisma/migrations/<timestamp>_task_assignees/` con un `migration.sql`. **Aún no se aplica a la BD.**

- [ ] **Step 2: Editar el `migration.sql` para intercalar la copia de datos**

Abrir el `migration.sql` generado. Debe crear la tabla `task_assignees` (con sus FKs) y borrar la columna `ownerId` de `tasks`. **Insertar el bloque de copia de datos INMEDIATAMENTE ANTES de la línea que borra la columna** (`ALTER TABLE "tasks" DROP COLUMN "ownerId";`). El archivo final debe quedar en este orden:

```sql
-- CreateTable
CREATE TABLE "task_assignees" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copiar responsables existentes ANTES de borrar la columna (sin pérdida de datos)
INSERT INTO "task_assignees" ("taskId", "userId")
SELECT "id", "ownerId" FROM "tasks" WHERE "ownerId" IS NOT NULL;

-- DropColumn (Postgres elimina el índice y la FK asociados junto con la columna)
ALTER TABLE "tasks" DROP COLUMN "ownerId";
```

**Verificación obligatoria del orden (aquí se juega la no pérdida de datos):** Prisma no garantiza el orden exacto de las sentencias autogeneradas. Antes de aplicar, confirmar leyendo el `migration.sql` que:
1. `CREATE TABLE "task_assignees"` **y sus dos** `ADD CONSTRAINT ... FOREIGN KEY` aparecen **antes** del `INSERT`.
2. El `INSERT ... SELECT` aparece **antes** de cualquier sentencia que elimine `ownerId` (`DROP COLUMN`, y si las hubiera, `DROP CONSTRAINT "tasks_ownerId_fkey"` / `DROP INDEX "tasks_ownerId_idx"`).

Notas:
- Si Prisma generó líneas explícitas `DROP INDEX "tasks_ownerId_idx"` o `ALTER TABLE "tasks" DROP CONSTRAINT "tasks_ownerId_fkey"`, déjalas donde estén (son inofensivas), pero muévelas **después** del `INSERT` si hubieran quedado antes de eliminar la columna.
- Toda la migración corre dentro de una transacción; si el INSERT fallara, se revierte y `ownerId` se conserva.

- [ ] **Step 3: Aplicar la migración**

Run: `cd backend && npx prisma migrate dev`
Expected: aplica la migración pendiente y regenera el cliente. Sin errores.

- [ ] **Step 4: Regenerar el cliente Prisma (por si acaso)**

Run: `cd backend && npm run prisma:generate`
Expected: `Generated Prisma Client` sin errores.

- [ ] **Step 5: Verificar la copia de datos (sin pérdida)**

Run:
```bash
docker compose exec -T postgres psql -U postgres -d vitamcore -c "SELECT count(*) FROM task_assignees;"
```
Expected: el conteo coincide con N anotado en Task 1 Step 3. Si N era 0, la tabla está vacía (correcto: no había responsables).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(back): tabla TaskAssignee + migración de ownerId sin pérdida de datos"
```

---

## Chunk 2: Backend (validación, service, actividad, agente)

### Task 4: Helper `assertAssignableUsers`

**Files:**
- Modify: `backend/src/modules/shared/relations.ts`

- [ ] **Step 1: Añadir el helper (junto a `assertAssignableUser`, sin borrarlo — proyectos aún lo usan)**

```typescript
/**
 * Verifica que todos los usuarios responsables existan (si vienen ids).
 * Como assertAssignableUser, solo comprueba existencia (no isActive): la
 * restricción de "solo activos" vive en el endpoint /assignees.
 */
export async function assertAssignableUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  const found = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  if (found.length !== userIds.length) {
    throw badRequest('Algún responsable indicado no existe');
  }
}
```

Nota: el llamador deduplica `userIds` antes de invocar (ver Task 6); este helper asume ids únicos.

- [ ] **Step 2: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/shared/relations.ts
git commit -m "feat(back): assertAssignableUsers para validar varios responsables"
```

---

### Task 5: Schemas Zod de tareas

**Files:**
- Modify: `backend/src/modules/tasks/tasks.schema.ts`

- [ ] **Step 1: Reemplazar `ownerId` por `assigneeIds` en `createTaskSchema`**

En `createTaskSchema`, eliminar la línea `ownerId: z.string().min(1).optional().nullable(),` y añadir:
```typescript
  assigneeIds: z.array(z.string().min(1)).optional(),
```
(`updateTaskSchema` lo hereda automáticamente vía `.omit(...).partial()`.)

- [ ] **Step 2: Reemplazar `ownerId` por `assigneeId` en `listTasksQuery`**

En `listTasksQuery`, cambiar `ownerId: z.string().optional(),` por:
```typescript
  assigneeId: z.string().optional(),
```

- [ ] **Step 3: Verificar typecheck (fallará en el service; es esperado hasta Task 6)**

Run: `cd backend && npm run build`
Expected: errores en `tasks.service.ts` referidos a `ownerId`/`assigneeId`. Se resuelven en la Task 6. (No commitear aún; este cambio va junto con la Task 6.)

---

### Task 6: Service de tareas (create/update/list/getById + actividad)

**Files:**
- Modify: `backend/src/modules/tasks/tasks.service.ts`
- Modify: `backend/src/modules/tasks/task-activity.service.ts`

- [ ] **Step 1: Quitar `ownerId` del tipo `ScalarState` y del diff escalar**

En `backend/src/modules/tasks/task-activity.service.ts`:
- En `type ScalarState`, eliminar la línea `ownerId: string | null;`.
- En `diffScalarEvents`, eliminar el bloque:
  ```typescript
  if ('ownerId' in input && (input.ownerId ?? null) !== prev.ownerId) {
    events.push({ type: TaskActivityType.ASSIGNED, data: {} });
  }
  ```

- [ ] **Step 2: `list` — filtro condicional por `assigneeId` e include de `assignees`**

En `tasks.service.ts`, función `list`:
- En el objeto `where`, eliminar la línea `ownerId: filters.ownerId,`.
- Después de armar `where` (antes del `return`), añadir el filtro condicional:
  ```typescript
  if (filters.assigneeId) {
    where.assignees = { some: { userId: filters.assigneeId } };
  }
  ```
- En el `include`, reemplazar `owner: { select: { id: true, name: true } },` por:
  ```typescript
  assignees: { include: { user: { select: { id: true, name: true } } } },
  ```

- [ ] **Step 3: `getById` — include de `assignees`**

En `getById`, reemplazar `owner: { select: { id: true, name: true } },` por:
```typescript
      assignees: { include: { user: { select: { id: true, name: true } } } },
```

- [ ] **Step 4: `create` — extraer `assigneeIds`, validar, insertar**

En `create`:
- Reemplazar `await assertAssignableUser(input.ownerId);` por (usando el helper nuevo y deduplicando):
  ```typescript
  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  await assertAssignableUsers(assigneeIds);
  ```
- Cambiar la desestructuración `const { labelIds, ...data } = input;` por `const { labelIds, assigneeIds: _ignore, ...data } = input;` (para que `assigneeIds` no llegue a `tx.task.create({ data })`).
- Dentro de `prisma.$transaction`, tras crear la tarea y las etiquetas, añadir:
  ```typescript
  if (assigneeIds.length) {
    await tx.taskAssignee.createMany({
      data: assigneeIds.map((userId) => ({ taskId: task.id, userId })),
    });
  }
  ```
- Actualizar el import: reemplazar `assertAssignableUser` por `assertAssignableUsers` en el `import { ... } from '../shared/relations'`.

- [ ] **Step 5: `update` — leer set previo, validar, reemplazar set, diff de actividad**

En `update`:
- En el `select` de `current`, eliminar `ownerId: true,` y añadir `assignees: { select: { userId: true } },`.
- Reemplazar `await assertAssignableUser(input.ownerId);` por:
  ```typescript
  const assigneeIds = input.assigneeIds
    ? [...new Set(input.assigneeIds)]
    : undefined;
  if (assigneeIds) await assertAssignableUsers(assigneeIds);
  ```
- Cambiar la desestructuración a `const { labelIds, assigneeIds: _ignore, ...data } = input;`.
- Dentro de la transacción, tras el bloque de etiquetas, añadir el reemplazo del set (solo si `assigneeIds` vino):
  ```typescript
  if (assigneeIds) {
    await tx.taskAssignee.deleteMany({ where: { taskId: id } });
    if (assigneeIds.length) {
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: id, userId })),
      });
    }
  }
  ```
- Pasar el set previo y el nuevo a `buildUpdateEvents` (ver Step 6).

- [ ] **Step 6: `buildUpdateEvents` — emitir `ASSIGNEE_ADDED`/`ASSIGNEE_REMOVED`**

⚠️ **Importante:** la función actual tiene dos `return events` tempranos (`if (!labelIds) return events;` y `if (added.length === 0 && removed.length === 0) return events;`). Si se dejan, un update que solo trae `assigneeIds` (el caso normal al reasignar) retornaría **antes** de emitir la actividad de responsables. Hay que **reestructurar la función completa** para eliminar esos returns tempranos y usar bloques `if` guardados independientes (uno para etiquetas, otro para responsables).

Reemplazar la función `buildUpdateEvents` completa por esta versión:

```typescript
/**
 * Deriva los eventos de actividad de un update: cambios escalares
 * (estado, fechas, proyecto), altas/bajas de etiquetas y altas/bajas de
 * responsables.
 */
async function buildUpdateEvents(
  tx: Prisma.TransactionClient,
  prev: {
    status: Prisma.TaskGetPayload<object>['status'];
    projectId: string | null;
    dueDate: Date | null;
    startDate: Date | null;
    labels: { labelId: string }[];
    assignees: { userId: string }[];
  },
  input: UpdateTaskInput,
  labelIds: string[] | undefined,
  assigneeIds: string[] | undefined,
): Promise<ActivityEvent[]> {
  const events = diffScalarEvents(prev, input);

  if (labelIds) {
    const before = new Set(prev.labels.map((l) => l.labelId));
    const after = new Set(labelIds);
    const added = labelIds.filter((l) => !before.has(l));
    const removed = [...before].filter((l) => !after.has(l));
    if (added.length || removed.length) {
      const names = new Map(
        (
          await tx.label.findMany({
            where: { id: { in: [...added, ...removed] } },
            select: { id: true, name: true },
          })
        ).map((l) => [l.id, l.name]),
      );
      for (const labelId of added) {
        events.push({ type: TaskActivityType.LABEL_ADDED, data: { labelId, name: names.get(labelId) ?? null } });
      }
      for (const labelId of removed) {
        events.push({ type: TaskActivityType.LABEL_REMOVED, data: { labelId, name: names.get(labelId) ?? null } });
      }
    }
  }

  if (assigneeIds) {
    const before = new Set(prev.assignees.map((a) => a.userId));
    const after = new Set(assigneeIds);
    const added = assigneeIds.filter((u) => !before.has(u));
    const removed = [...before].filter((u) => !after.has(u));
    if (added.length || removed.length) {
      const names = new Map(
        (
          await tx.user.findMany({
            where: { id: { in: [...added, ...removed] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name]),
      );
      for (const userId of added) {
        events.push({ type: TaskActivityType.ASSIGNEE_ADDED, data: { userId, name: names.get(userId) ?? null } });
      }
      for (const userId of removed) {
        events.push({ type: TaskActivityType.ASSIGNEE_REMOVED, data: { userId, name: names.get(userId) ?? null } });
      }
    }
  }

  return events;
}
```

- Actualizar la llamada en `update`: `await buildUpdateEvents(tx, current, input, labelIds, assigneeIds)`.
- Nota: `diffScalarEvents(prev, input)` sigue funcionando porque `prev` trae campos de más (no hay excess-property check al pasar una variable).

- [ ] **Step 7: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/tasks/tasks.schema.ts backend/src/modules/tasks/tasks.service.ts backend/src/modules/tasks/task-activity.service.ts
git commit -m "feat(back): tareas con múltiples responsables (assigneeIds) + actividad add/remove"
```

---

### Task 7: Agente

**Files:**
- Modify: `backend/src/modules/agent/agent.service.ts`

- [ ] **Step 1: Quitar `ownerId: null` del payload de creación**

En `agent.service.ts` (`convertProposedTask`), eliminar la línea `ownerId: null,` del objeto que se pasa a `createTask` (la IA crea la tarea sin responsables; `assigneeIds` es opcional y se omite).

- [ ] **Step 2: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/agent/agent.service.ts
git commit -m "fix(back): agente crea tareas sin responsables (drop ownerId)"
```

---

### Task 8: Adaptar y ampliar tests de backend

**Files:**
- Modify: `backend/test/tasks.service.test.ts`
- Modify: `backend/test/task-activity.service.test.ts`

- [ ] **Step 1: Reescribir `tasks.service.test.ts` para `assigneeIds`/`assigneeId`**

Reemplazar el contenido del `describe('tasks.create — responsable', ...)` por casos sobre el nuevo modelo. Contenido completo del archivo:

```typescript
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeUser } from './fixtures';
import * as tasks from '../src/modules/tasks/tasks.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('tasks — responsables (assignees)', () => {
  test('crea con varios responsables y los incluye al listar', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    await tasks.create({
      organizationId: org.id, title: 'Tarea con dueños',
      assigneeIds: [ana.id, beto.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    const names = list[0].assignees.map((a: { user: { name: string } }) => a.user.name).sort();
    expect(names).toEqual(['Ana', 'Beto']);
  });

  test('assigneeId inexistente => badRequest (400)', async () => {
    const org = await makeOrg();
    await expect(
      tasks.create({
        organizationId: org.id, title: 'X', assigneeIds: ['no-existe'],
        status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('ids duplicados no rompen (dedupe)', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    await tasks.create({
      organizationId: org.id, title: 'Dup', assigneeIds: [ana.id, ana.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list[0].assignees).toHaveLength(1);
  });

  test('update reemplaza el set completo de responsables', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    const created = await tasks.create({
      organizationId: org.id, title: 'T', assigneeIds: [ana.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    await tasks.update(created.id, { assigneeIds: [beto.id] } as never, null);
    const detail = await tasks.getById(created.id);
    const names = detail.assignees.map((a: { user: { name: string } }) => a.user.name);
    expect(names).toEqual(['Beto']);
  });

  test('filtra por assigneeId', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    await tasks.create({ organizationId: org.id, title: 'De Ana', assigneeIds: [ana.id], status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    await tasks.create({ organizationId: org.id, title: 'De Beto', assigneeIds: [beto.id], status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const soloAna = await tasks.list({ assigneeId: ana.id } as never);
    expect(soloAna).toHaveLength(1);
    expect(soloAna[0].title).toBe('De Ana');
  });

  test('listar sin assigneeId incluye tareas sin responsable', async () => {
    const org = await makeOrg();
    await tasks.create({ organizationId: org.id, title: 'Sin dueño', status: 'TODO', priority: 'MEDIUM', source: 'MANUAL' } as never);
    const list = await tasks.list({ organizationId: org.id } as never);
    expect(list).toHaveLength(1);
    expect(list[0].assignees).toHaveLength(0);
  });

  test('altas/bajas de responsables generan actividad', async () => {
    const org = await makeOrg();
    const ana = await makeUser({ name: 'Ana', email: 'ana@t.local' });
    const beto = await makeUser({ name: 'Beto', email: 'beto@t.local' });
    const created = await tasks.create({
      organizationId: org.id, title: 'T', assigneeIds: [ana.id],
      status: 'TODO', priority: 'MEDIUM', source: 'MANUAL',
    } as never);
    await tasks.update(created.id, { assigneeIds: [beto.id] } as never, null);
    const detail = await tasks.getById(created.id);
    const types = detail.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('ASSIGNEE_ADDED');
    expect(types).toContain('ASSIGNEE_REMOVED');
  });
});
```

- [ ] **Step 2: Adaptar `task-activity.service.test.ts`**

- En el objeto `base`, eliminar la línea `ownerId: null as string | null,`.
- Eliminar el test `test('reasignar => ASSIGNED', ...)` completo (la lógica de responsables ya no vive en `diffScalarEvents`; su cobertura está en `tasks.service.test.ts`).

- [ ] **Step 3: Correr los tests**

Run: `cd backend && npm test`
Expected: todos los tests pasan (incluidos los nuevos de responsables). Si la BD de test no está lista, correr antes `npm run test:db:setup`.

- [ ] **Step 4: Commit**

```bash
git add backend/test/tasks.service.test.ts backend/test/task-activity.service.test.ts
git commit -m "test(back): cobertura de múltiples responsables por tarea"
```

---

## Chunk 3: Frontend

### Task 9: Tipos

**Files:**
- Modify: `frontend/src/types/core.ts`

- [ ] **Step 1: Cambiar la interfaz `Task`**

En `interface Task`:
- Eliminar `ownerId: string | null;` y `owner: Ref | null;`.
- Añadir (junto a `labels?`): `assignees: { user: Ref }[];`.

- [ ] **Step 2: Ampliar `TaskActivityType`**

En el union `TaskActivityType`, añadir `| 'ASSIGNEE_ADDED' | 'ASSIGNEE_REMOVED'` (mantener `'ASSIGNED'`).

- [ ] **Step 3: Verificar typecheck (fallará en consumidores; se resuelve en tasks siguientes)**

Run: `cd frontend && npm run lint`
Expected: errores en `TaskForm`, `TaskPanel`, `TaskCard`, `TasksTableView` por `owner`/`ownerId`. Se resuelven en las tasks 10–12. No commitear aún; el cambio de tipos va junto con sus consumidores.

---

### Task 10: Componentes `AssigneePicker` y `AssigneeAvatars`

**Files:**
- Create: `frontend/src/components/tasks/AssigneePicker.tsx`
- Create: `frontend/src/components/tasks/AssigneeAvatars.tsx`

- [ ] **Step 1: Crear `AssigneePicker.tsx` (chips toggle, calcado de `LabelPicker` sin "crear")**

```tsx
import { useAssignees } from '@/hooks/useAssignees';

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function AssigneePicker({ selected, onChange }: Props) {
  const { data: assignees } = useAssignees();

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {(assignees ?? []).map((u) => {
        const on = selected.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-foreground)] ring-2 ring-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-70'}`}
          >
            {u.name}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Crear `AssigneeAvatars.tsx` (avatares apilados con "+X")**

```tsx
import type { Ref } from '@/types/domain';

// Iniciales (máx. 2) para el avatar.
function initials(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface Props {
  users: Ref[];
  max?: number;
}

export function AssigneeAvatars({ users, max = 3 }: Props) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <span
          key={u.id}
          title={u.name}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-card)] bg-[var(--color-muted)] text-[10px] font-semibold text-[var(--color-foreground)]"
        >
          {initials(u.name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={users.slice(max).map((u) => u.name).join(', ')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-card)] bg-[var(--color-muted)] text-[10px] font-semibold text-[var(--color-muted-foreground)]"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
```

Nota: `Ref` se exporta desde `@/types/domain` (reexporta `core.ts`). Verifica el import correcto; si `domain.ts` no reexporta `Ref`, impórtalo desde `@/types/core`.

- [ ] **Step 3: Verificar typecheck de los componentes nuevos aislados**

Run: `cd frontend && npm run lint`
Expected: los errores restantes son solo en los consumidores viejos (forms/card/table). No commitear aún (van junto con la Task 12).

---

### Task 11: `useTasks` — filtro `assigneeId`

**Files:**
- Modify: `frontend/src/hooks/useTasks.ts`

- [ ] **Step 1: Cambiar el tipo de filtros**

En `type TaskFilters`, reemplazar `ownerId?: string;` por `assigneeId?: string;`.

---

### Task 12: Consumidores UI (form, panel, card, tabla, página, actividad)

**Files:**
- Modify: `frontend/src/pages/tasks/TaskForm.tsx`
- Modify: `frontend/src/components/tasks/TaskPanel.tsx`
- Modify: `frontend/src/pages/tasks/TaskCard.tsx`
- Modify: `frontend/src/components/tasks/TasksTableView.tsx`
- Modify: `frontend/src/pages/tasks/TasksPage.tsx`
- Modify: `frontend/src/lib/taskActivity.ts`

- [ ] **Step 1: `TaskForm.tsx`**

- Reemplazar el import `import { useAssignees } from '@/hooks/useAssignees';` por `import { AssigneePicker } from '@/components/tasks/AssigneePicker';` (y eliminar `const { data: assignees } = useAssignees();` y `assigneeOptions`).
- En el estado `form`, reemplazar `ownerId: task?.ownerId ?? '',` por `assigneeIds: task?.assignees?.map((a) => a.user.id) ?? [],`.
- La función `set` está tipada para `string`; para `assigneeIds` (array) usa `setForm` directo. Reemplazar en el `<Field label="Responsable">` el `<Select>` por:
  ```tsx
  <Field label="Responsables">
    <AssigneePicker
      selected={form.assigneeIds}
      onChange={(ids) => setForm((f) => ({ ...f, assigneeIds: ids }))}
    />
  </Field>
  ```
- En `handleSubmit`, en el objeto `base`, reemplazar `ownerId: form.ownerId || null,` por `assigneeIds: form.assigneeIds,`.

- [ ] **Step 2: `TaskPanel.tsx`**

- Reemplazar el import `useAssignees` por `import { AssigneePicker } from './AssigneePicker';` (y quitar `const { data: assignees } = useAssignees();`).
- Reemplazar el `<Field label="Responsable">` con su `<Select>` por:
  ```tsx
  <Field label="Responsables">
    <AssigneePicker
      selected={(task.assignees ?? []).map((a) => a.user.id)}
      onChange={(ids) => patch({ assigneeIds: ids })}
    />
  </Field>
  ```
  (Mantener el `<div />` de relleno del grid si aplica, o ajustar el layout del grid de 2 columnas.)

- [ ] **Step 3: `TaskCard.tsx`**

- Eliminar la función local `initials` (se movió a `AssigneeAvatars`).
- Importar `import { AssigneeAvatars } from '@/components/tasks/AssigneeAvatars';`.
- Reemplazar el bloque del avatar único (`{task.owner?.name && (...)}`) por:
  ```tsx
  <AssigneeAvatars users={task.assignees.map((a) => a.user)} />
  ```

- [ ] **Step 4: `TasksTableView.tsx`**

- Importar `AssigneeAvatars`.
- Reemplazar la celda `{task.owner?.name ?? '—'}` por:
  ```tsx
  {task.assignees.length > 0 ? (
    <AssigneeAvatars users={task.assignees.map((a) => a.user)} />
  ) : (
    '—'
  )}
  ```

- [ ] **Step 5: `TasksPage.tsx` — filtro "mis tareas"**

En el botón "Mis tareas", reemplazar las referencias a `ownerId` por `assigneeId`:
```tsx
variant={filters.assigneeId ? 'primary' : 'outline'}
onClick={() =>
  setFilters((f) => ({
    ...f,
    assigneeId: f.assigneeId ? undefined : user?.id,
  }))
}
```

- [ ] **Step 6: `lib/taskActivity.ts` — textos de actividad**

- Mantener el `case 'ASSIGNED':` existente (eventos históricos).
- Añadir antes del `default`:
  ```tsx
  case 'ASSIGNEE_ADDED':
    return `agregó a ${d.name ?? ''} como responsable`;
  case 'ASSIGNEE_REMOVED':
    return `quitó a ${d.name ?? ''} de responsables`;
  ```

- [ ] **Step 7: Verificar typecheck completo del frontend**

Run: `cd frontend && npm run lint`
Expected: `tsc --noEmit` sin errores.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(front): UI de múltiples responsables por tarea (picker + avatares)"
```

---

## Chunk 4: Verificación end-to-end

### Task 13: Verificación integral

**Files:** ninguno

- [ ] **Step 1: Build backend**

Run: `cd backend && npm run build`
Expected: sin errores.

- [ ] **Step 2: Tests backend**

Run: `cd backend && npm test`
Expected: todos pasan.

- [ ] **Step 3: Typecheck + build frontend**

Run: `cd frontend && npm run build`
Expected: `tsc --noEmit && vite build` sin errores.

- [ ] **Step 4: Smoke manual (levantar backend y frontend)**

Con `docker compose up -d`, `cd backend && npm run dev` y `cd frontend && npm run dev`, verificar en `http://localhost:5173`:
- Crear una tarea asignando **2+ responsables** desde el formulario.
- Ver los avatares apilados en la tarjeta (tablero) y en la vista de tabla.
- Abrir el panel de la tarea, agregar y quitar un responsable, y confirmar que el historial muestra "agregó a … como responsable" / "quitó a … de responsables".
- Activar el filtro "Mis tareas" y confirmar que muestra solo las tareas donde el usuario logueado es responsable.

- [ ] **Step 5: Verificación final de no pérdida de datos**

Confirmar que las tareas que tenían responsable antes de la migración conservan a esa persona como responsable (comparar contra el conteo N de la Task 1). Una vez validado todo, el archivo `backup-antes-task-assignees.sql` puede archivarse o borrarse (no versionar en git).

---

## Fuera de alcance (recordatorio)

- Responsables en proyectos (siguen con `ownerId` único).
- Responsable "principal" / jerarquía.
- Notificaciones.
- Reportes de carga por persona.
