# Gestión de tareas — Fase 2: Checklist / subtareas — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una checklist plana por tarea: ítems marcables con orden, gestionados desde el panel de tarjeta, con barra de progreso e indicador `✔ N/M` en la tarjeta.

**Architecture:** Backend Express + Prisma: nuevo modelo `ChecklistItem` (por tarea, con `position`) y endpoints anidados bajo `/tasks/:id/checklist`. `getById` incluye los ítems ordenados; `list` incluye solo `{ done }` de cada ítem para derivar el progreso en el cliente. Frontend: sección Checklist en el `TaskPanel` (Fase 1) y un indicador de progreso en `TaskCard`.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, Vitest, React + TanStack Query. Sin nuevas dependencias.

**Spec:** `docs/superpowers/specs/2026-07-03-gestion-tareas-rica-integrada-design.md` (Fase 2).

**Prerequisito:** Fase 1 mergeada (panel de tarjeta, tipos `TaskDetail`, hooks `useTaskDetail`).

**Verificación global:** backend `npm run build` + `npm test`; frontend `npm run lint` + `npm run build`. La BD de dev puede estar vacía entre sesiones → repoblar con `npm run prisma:seed` antes del smoke manual.

---

## Mapa de archivos

**Backend — crear:**
- `backend/src/modules/tasks/checklist.schema.ts` — Zod (create/update).
- `backend/src/modules/tasks/checklist.service.ts` — add/update/remove ítems, coherencia item↔task.
- `backend/src/modules/tasks/checklist.controller.ts` — controllers.
- `backend/test/checklist.service.test.ts` — tests.

**Backend — modificar:**
- `backend/prisma/schema.prisma` — modelo `ChecklistItem` + back-relation en `Task`.
- `backend/prisma/migrations/<ts>_checklist/migration.sql` — migración aditiva.
- `backend/src/modules/tasks/tasks.routes.ts` — rutas anidadas de checklist.
- `backend/src/modules/tasks/tasks.service.ts` — include `checklistItems` en `list` (solo `done`) y `getById` (ordenado por `position`).

**Frontend — modificar:**
- `frontend/src/types/core.ts` — `ChecklistItem`; `Task.checklistItems?`; `TaskDetail.checklistItems`.
- `frontend/src/types/domain.ts` — re-exportar `ChecklistItem`.
- `frontend/src/hooks/useChecklist.ts` — **crear**: mutaciones add/update/remove.
- `frontend/src/components/tasks/ChecklistSection.tsx` — **crear**: sección de checklist del panel.
- `frontend/src/components/tasks/TaskPanel.tsx` — montar `ChecklistSection`.
- `frontend/src/components/tasks/checklistProgress.ts` — **crear**: helper `{ total, done }` desde ítems.
- `frontend/src/pages/tasks/TaskCard.tsx` — indicador `✔ N/M`.

---

## Chunk 1: Backend — modelo, migración y endpoints

### Task 1: Schema Prisma — `ChecklistItem`

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Back-relation en `Task`** — en `model Task`, junto a `labels TaskLabel[]`, añadir:
```prisma
  checklistItems ChecklistItem[]
```

- [ ] **Step 2: Añadir el modelo** tras `model TaskLabel { ... }`:
```prisma
/// Ítem de checklist plana de una tarea (con orden).
model ChecklistItem {
  id        String   @id @default(cuid())
  taskId    String
  text      String
  done      Boolean  @default(false)
  position  Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@map("checklist_items")
}
```

- [ ] **Step 3: Validar**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(back): modelo ChecklistItem en schema"
```

### Task 2: Migración aditiva

**Files:**
- Create: `backend/prisma/migrations/20260703130000_checklist/migration.sql`

- [ ] **Step 1: Escribir la migración** (aditiva; se crea a mano y se aplica con `migrate deploy`, porque `migrate dev` es interactivo en este entorno):

`backend/prisma/migrations/20260703130000_checklist/migration.sql`:
```sql
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_items_taskId_idx" ON "checklist_items"("taskId");

ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 2: Aplicar a dev + regenerar cliente + aplicar a test**

Run: `cd backend && npx prisma migrate deploy && npm run prisma:generate && npm run test:db:setup`
Expected: aplica `20260703130000_checklist` a dev y a `vitamcore_test`, cliente regenerado.

- [ ] **Step 3: Verificar la tabla**

Run: `docker exec vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT to_regclass('public.checklist_items');"`
Expected: `checklist_items` (no `NULL`).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/migrations
git commit -m "feat(back): migración checklist_items"
```

### Task 3: Módulo checklist (service + schema + controller + rutas)

**Files:**
- Create: `backend/src/modules/tasks/checklist.schema.ts`
- Create: `backend/src/modules/tasks/checklist.service.ts`
- Create: `backend/src/modules/tasks/checklist.controller.ts`
- Modify: `backend/src/modules/tasks/tasks.routes.ts`
- Test: `backend/test/checklist.service.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `backend/test/checklist.service.test.ts`:

```typescript
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeTask } from './fixtures';
import * as checklist from '../src/modules/tasks/checklist.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('checklist.service', () => {
  test('addItem asigna position incremental', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const a = await checklist.addItem(task.id, { text: 'Uno' } as never);
    const b = await checklist.addItem(task.id, { text: 'Dos' } as never);
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  test('addItem sobre tarea inexistente => notFound (404)', async () => {
    await expect(
      checklist.addItem('no-existe', { text: 'X' } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('updateItem marca done y renombra', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const item = await checklist.addItem(task.id, { text: 'Uno' } as never);
    const upd = await checklist.updateItem(task.id, item.id, { done: true, text: 'Uno v2' } as never);
    expect(upd.done).toBe(true);
    expect(upd.text).toBe('Uno v2');
  });

  test('updateItem de ítem de otra tarea => notFound (404)', async () => {
    const org = await makeOrg();
    const t1 = await makeTask(org.id);
    const t2 = await makeTask(org.id, { title: 'Otra' });
    const item = await checklist.addItem(t1.id, { text: 'Uno' } as never);
    await expect(
      checklist.updateItem(t2.id, item.id, { done: true } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('removeItem elimina', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const item = await checklist.addItem(task.id, { text: 'Uno' } as never);
    await checklist.removeItem(task.id, item.id);
    const rest = await checklist.listByTask(task.id);
    expect(rest).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/checklist.service.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar `checklist.schema.ts`**

```typescript
import { z } from 'zod';

export const createChecklistItemSchema = z.object({
  text: z.string().trim().min(1, 'El texto es obligatorio').max(500),
});

export const updateChecklistItemSchema = z
  .object({
    text: z.string().trim().min(1).max(500).optional(),
    done: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
```

- [ ] **Step 4: Implementar `checklist.service.ts`**

```typescript
/**
 * Ítems de checklist de una tarea. Orden por `position` (0-based).
 */
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { CreateChecklistItemInput, UpdateChecklistItemInput } from './checklist.schema';

export function listByTask(taskId: string) {
  return prisma.checklistItem.findMany({
    where: { taskId },
    orderBy: { position: 'asc' },
  });
}

export async function addItem(taskId: string, input: CreateChecklistItemInput) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw notFound('Tarea no encontrada');
  const last = await prisma.checklistItem.findFirst({
    where: { taskId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const position = last ? last.position + 1 : 0;
  return prisma.checklistItem.create({ data: { taskId, text: input.text, position } });
}

export async function updateItem(taskId: string, itemId: string, input: UpdateChecklistItemInput) {
  await assertItemInTask(taskId, itemId);
  return prisma.checklistItem.update({ where: { id: itemId }, data: input });
}

export async function removeItem(taskId: string, itemId: string) {
  await assertItemInTask(taskId, itemId);
  await prisma.checklistItem.delete({ where: { id: itemId } });
}

async function assertItemInTask(taskId: string, itemId: string) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { taskId: true },
  });
  if (!item || item.taskId !== taskId) throw notFound('Ítem de checklist no encontrado');
}
```

- [ ] **Step 5: Ejecutar para verlo pasar**

Run: `cd backend && npx vitest run test/checklist.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Implementar `checklist.controller.ts`**

```typescript
import type { Request, Response } from 'express';
import { createChecklistItemSchema, updateChecklistItemSchema } from './checklist.schema';
import * as service from './checklist.service';

export async function addItemController(req: Request, res: Response) {
  const input = createChecklistItemSchema.parse(req.body);
  res.status(201).json({ data: await service.addItem(req.params.id, input) });
}
export async function updateItemController(req: Request, res: Response) {
  const input = updateChecklistItemSchema.parse(req.body);
  res.json({ data: await service.updateItem(req.params.id, req.params.itemId, input) });
}
export async function removeItemController(req: Request, res: Response) {
  await service.removeItem(req.params.id, req.params.itemId);
  res.json({ ok: true });
}
```

- [ ] **Step 7: Añadir las rutas anidadas** en `backend/src/modules/tasks/tasks.routes.ts`. Importar los controllers de checklist y añadir, después de las rutas existentes:
```typescript
import {
  addItemController,
  updateItemController,
  removeItemController,
} from './checklist.controller';
// ...
tasksRouter.post('/:id/checklist', asyncHandler(addItemController));
tasksRouter.patch('/:id/checklist/:itemId', asyncHandler(updateItemController));
tasksRouter.delete('/:id/checklist/:itemId', asyncHandler(removeItemController));
```
> Nota: `/api/tasks` ya está montado con `requireRole(...ALL_ROLES)` en `routes/index.ts`, así que las rutas anidadas heredan el acceso de todos los roles. No hay cambios en `routes/index.ts`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/tasks/checklist.schema.ts backend/src/modules/tasks/checklist.service.ts backend/src/modules/tasks/checklist.controller.ts backend/src/modules/tasks/tasks.routes.ts backend/test/checklist.service.test.ts
git commit -m "feat(back): endpoints de checklist anidados en /tasks/:id/checklist"
```

### Task 4: Include de checklist en `list` y `getById`

**Files:**
- Modify: `backend/src/modules/tasks/tasks.service.ts`
- Test: `backend/test/checklist.service.test.ts` (añadir 1 caso)

- [ ] **Step 1: Añadir un test de include** al final del `describe` en `checklist.service.test.ts`:

```typescript
  test('getById incluye ítems ordenados; list incluye solo done', async () => {
    const org = await makeOrg();
    const task = await makeTask(org.id);
    const a = await checklist.addItem(task.id, { text: 'Uno' } as never);
    await checklist.addItem(task.id, { text: 'Dos' } as never);
    await checklist.updateItem(task.id, a.id, { done: true } as never);

    const tasksService = await import('../src/modules/tasks/tasks.service');
    const detail = await tasksService.getById(task.id);
    expect(detail.checklistItems.map((i: { text: string }) => i.text)).toEqual(['Uno', 'Dos']);

    const list = await tasksService.list({ organizationId: org.id } as never);
    const flags = list[0].checklistItems.map((i: { done: boolean }) => i.done);
    expect(flags).toContain(true);
    expect(flags).toHaveLength(2);
  });
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/checklist.service.test.ts`
Expected: FAIL — `checklistItems` no está en el resultado.

- [ ] **Step 3: Añadir los includes** en `tasks.service.ts`:

En el `include` de `list` (tras `labels: { include: { label: true } },`):
```typescript
      checklistItems: { select: { done: true } },
```
En el `include` de `getById` (tras `labels: { include: { label: true } },`):
```typescript
      checklistItems: { orderBy: { position: 'asc' } },
```

- [ ] **Step 4: Ejecutar para verlo pasar + suite completa**

Run: `cd backend && npx vitest run test/checklist.service.test.ts && npm run build && npm test`
Expected: el nuevo test PASA; build limpio; **toda** la suite verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tasks/tasks.service.ts backend/test/checklist.service.test.ts
git commit -m "feat(back): include de checklist en list (done) y getById (ordenado)"
```

---

## Chunk 2: Frontend — sección de checklist y progreso

### Task 5: Tipos y helper de progreso

**Files:**
- Modify: `frontend/src/types/core.ts`
- Modify: `frontend/src/types/domain.ts`
- Create: `frontend/src/components/tasks/checklistProgress.ts`

- [ ] **Step 1: Tipos en `core.ts`** — añadir el tipo `ChecklistItem`:
```typescript
export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}
```
En `interface Task`, junto a `labels?`, añadir:
```typescript
  checklistItems?: { done: boolean }[];
```
En `interface TaskDetail`, añadir la forma completa:
```typescript
  checklistItems: ChecklistItem[];
```

- [ ] **Step 2: Re-exportar** `ChecklistItem` en `types/domain.ts` (añadir a la lista `from './core'`).

- [ ] **Step 3: Helper de progreso** — `frontend/src/components/tasks/checklistProgress.ts`:
```typescript
export function checklistProgress(items?: { done: boolean }[]) {
  const total = items?.length ?? 0;
  const done = items?.filter((i) => i.done).length ?? 0;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/types/core.ts frontend/src/types/domain.ts frontend/src/components/tasks/checklistProgress.ts
git commit -m "feat(front): tipos ChecklistItem + helper de progreso"
```

### Task 6: Hook `useChecklist`

**Files:**
- Create: `frontend/src/hooks/useChecklist.ts`

- [ ] **Step 1: Crear el hook** con las tres mutaciones; cada una invalida el detalle de la tarea y la lista (para el indicador de la tarjeta):

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function useInvalidate(taskId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };
}

export function useAddChecklistItem(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (text: string) => api.post(`/tasks/${taskId}/checklist`, { text }),
    onSuccess: invalidate,
  });
}

export function useUpdateChecklistItem(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) =>
      api.patch(`/tasks/${taskId}/checklist/${itemId}`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteChecklistItem(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (itemId: string) => api.del(`/tasks/${taskId}/checklist/${itemId}`),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
git add frontend/src/hooks/useChecklist.ts
git commit -m "feat(front): hook useChecklist (add/update/delete)"
```

### Task 7: `ChecklistSection` en el panel

**Files:**
- Create: `frontend/src/components/tasks/ChecklistSection.tsx`
- Modify: `frontend/src/components/tasks/TaskPanel.tsx`

- [ ] **Step 1: Crear `ChecklistSection.tsx`** — recibe `taskId` e `items: ChecklistItem[]`. Barra de progreso, lista de ítems (checkbox `done` + texto + borrar), y un input para añadir. Reordenar: botones ▲/▼ que intercambian `position` con el vecino (dos PATCH).

```typescript
import { useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from '@/hooks/useChecklist';
import { checklistProgress } from './checklistProgress';
import type { ChecklistItem } from '@/types/domain';

export function ChecklistSection({ taskId, items }: { taskId: string; items: ChecklistItem[] }) {
  const add = useAddChecklistItem(taskId);
  const update = useUpdateChecklistItem(taskId);
  const remove = useDeleteChecklistItem(taskId);
  const [text, setText] = useState('');
  const { total, done, pct } = checklistProgress(items);

  function submit() {
    if (!text.trim()) return;
    add.mutate(text.trim());
    setText('');
  }

  function move(index: number, dir: -1 | 1) {
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    update.mutate({ itemId: item.id, data: { position: other.position } });
    update.mutate({ itemId: other.id, data: { position: item.position } });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
          Checklist {total > 0 && `· ${done}/${total}`}
        </p>
      </div>
      {total > 0 && (
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => update.mutate({ itemId: item.id, data: { done: e.target.checked } })}
            />
            <span className={`flex-1 text-sm ${item.done ? 'text-[var(--color-muted-foreground)] line-through' : ''}`}>
              {item.text}
            </span>
            <Button size="sm" variant="ghost" title="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Bajar" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Borrar" onClick={() => remove.mutate(item.id)}>
              <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Añadir ítem…"
        />
        <Button type="button" variant="outline" size="sm" onClick={submit} disabled={add.isPending}>
          Añadir
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar en `TaskPanel`** — reemplazar el comentario `{/* Fase 2: Checklist */}` por:
```tsx
          <ChecklistSection taskId={task.id} items={task.checklistItems ?? []} />
```
y añadir el import: `import { ChecklistSection } from './ChecklistSection';`.

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tasks/ChecklistSection.tsx frontend/src/components/tasks/TaskPanel.tsx
git commit -m "feat(front): sección de checklist en el panel de tarjeta"
```

### Task 8: Indicador de progreso en la tarjeta

**Files:**
- Modify: `frontend/src/pages/tasks/TaskCard.tsx`

- [ ] **Step 1: Mostrar `✔ N/M`** en la fila inferior de la tarjeta cuando hay ítems. Importar el helper y `CheckSquare` de lucide:
```typescript
import { CheckSquare } from 'lucide-react';
import { checklistProgress } from '@/components/tasks/checklistProgress';
```
Calcular `const cl = checklistProgress(task.checklistItems);` y, en la fila inferior (junto a prioridad/fecha/avatar), añadir cuando `cl.total > 0`:
```tsx
{cl.total > 0 && (
  <span className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
    <CheckSquare className="h-3.5 w-3.5" /> {cl.done}/{cl.total}
  </span>
)}
```
(Colocarlo dentro del contenedor de la derecha, antes o después de la fecha, según se vea mejor.)

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tasks/TaskCard.tsx
git commit -m "feat(front): indicador de progreso de checklist en la tarjeta"
```

---

## Verificación final Fase 2 (smoke manual)

- [ ] `npm run prisma:seed` si dev está vacía. Backend + frontend en `dev`, login CEO.
- [ ] Abrir una tarea → en el panel, la sección Checklist: añadir 3 ítems, marcar 1 → la barra muestra 1/3 (33%).
- [ ] Reordenar con ▲/▼; borrar un ítem.
- [ ] En el tablero Kanban, la tarjeta muestra `✔ 1/3`.
- [ ] La checklist funciona igual desde el panel abierto en el detalle del proyecto.
- [ ] Backend: `POST /tasks/:id/checklist` sobre tarea inexistente → 404; PATCH de ítem de otra tarea → 404.
