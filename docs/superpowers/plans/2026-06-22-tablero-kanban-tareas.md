# Tablero Kanban de Tareas — Plan de Implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir al módulo de Tareas un tablero Kanban de 3 columnas (Por hacer / Haciendo / Hecho) con drag & drop, mostrado por proyecto, reduciendo el modelo de estados de tarea de 6 a 3.

**Architecture:** El enum `TaskStatus` de Prisma se reduce a `TODO`/`DOING`/`DONE` mediante una migración que remapea los datos existentes; los consumidores backend (tareas, dashboard, agente, seed) y frontend (tipos, dominio, formulario, detalle de proyecto) se alinean. Luego se construye el Kanban en la página de Tareas como vista alternativa a la tabla (toggle), con drag & drop nativo HTML5 y una mutación optimista de React Query.

**Tech Stack:** Backend Express + Prisma (PostgreSQL); frontend React 18 + Vite + TanStack React Query + Tailwind v4. **Sin framework de tests**: la verificación de cada tarea es typecheck (`npm run build` backend / `npm run lint` frontend) + prueba manual.

**Spec de referencia:** `docs/superpowers/specs/2026-06-22-tablero-kanban-tareas-design.md`

**Convención de verificación (este repo no tiene tests automatizados):**
- Backend: `cd backend && npm run build` (ejecuta `tsc -p tsconfig.json`; éxito = sin salida y exit 0).
- Frontend: `cd frontend && npm run lint` (ejecuta `tsc --noEmit`; éxito = sin salida y exit 0).
- La base de datos debe estar levantada para migrar: `docker compose up -d` desde la raíz.

**Mapeo de estados (vigente en toda la migración):**
`PENDING → TODO` · `IN_PROGRESS → DOING` · `BLOCKED → DOING` · `IN_REVIEW → DOING` · `COMPLETED → DONE` · `CANCELLED → DONE`

---

## Chunk 1: Backend — reducción de estados (modelo, migración y consumidores)

> Al terminar este chunk el backend compila, la BD migra preservando las tareas, y el dashboard/agente/seed usan los 3 estados nuevos.

### Task 1: Reducir el enum `TaskStatus` en Prisma y migrar con remapeo

**Files:**
- Modify: `backend/prisma/schema.prisma:53-60` (enum) y `backend/prisma/schema.prisma:348` (default)
- Create: `backend/prisma/migrations/<timestamp>_kanban_task_status/migration.sql` (generado por la CLI y editado a mano)

- [ ] **Step 1: Levantar la base de datos**

Run (desde la raíz): `docker compose up -d`
Expected: contenedor `vitamcore-postgres` `healthy`.

- [ ] **Step 2: Editar el enum y el default en `schema.prisma`**

Reemplazar el bloque del enum (líneas ~53-60):

```prisma
/// Estados de una tarea.
enum TaskStatus {
  TODO
  DOING
  DONE
}
```

Y en el modelo `Task` (línea ~348) cambiar el default:

```prisma
  status         TaskStatus @default(TODO)
```

- [ ] **Step 3: Generar la migración SIN aplicarla**

Run: `cd backend && npx prisma migrate dev --name kanban_task_status --create-only`
Expected: crea una carpeta `prisma/migrations/<timestamp>_kanban_task_status/` con un `migration.sql` autogenerado (probablemente destructivo). NO se aplica todavía.

- [ ] **Step 4: Reemplazar el contenido de `migration.sql` por el remapeo seguro**

Sustituir TODO el contenido del `migration.sql` recién creado por:

```sql
-- Reducción de TaskStatus de 6 a 3 valores preservando las tareas existentes.
-- Mapeo: PENDING→TODO; IN_PROGRESS/BLOCKED/IN_REVIEW→DOING; COMPLETED/CANCELLED→DONE.

-- 1. Nuevo enum
CREATE TYPE "TaskStatus_new" AS ENUM ('TODO', 'DOING', 'DONE');

-- 2. Quitar el default para poder alterar el tipo de la columna
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;

-- 3. Convertir la columna remapeando los valores antiguos
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "TaskStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING'     THEN 'TODO'
      WHEN 'IN_PROGRESS' THEN 'DOING'
      WHEN 'BLOCKED'     THEN 'DOING'
      WHEN 'IN_REVIEW'   THEN 'DOING'
      WHEN 'COMPLETED'   THEN 'DONE'
      WHEN 'CANCELLED'   THEN 'DONE'
    END
  )::"TaskStatus_new";

-- 4. Intercambiar el tipo viejo por el nuevo
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE "TaskStatus_old";

-- 5. Restaurar el default con el nuevo valor
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'TODO';
```

- [ ] **Step 5: Aplicar la migración y regenerar el cliente**

Run: `cd backend && npx prisma migrate dev`
Expected: "Applying migration `<timestamp>_kanban_task_status`" sin errores; regenera el cliente Prisma automáticamente.

- [ ] **Step 6: Verificar el remapeo de datos**

Run: `cd backend && npx prisma studio` (abrir tabla `tasks`) — o una consulta rápida.
Expected: ninguna tarea con estado distinto de `TODO`/`DOING`/`DONE`; la tarea sembrada "Preparar despliegue de entorno de staging" (antes `COMPLETED`) ahora es `DONE`, y "Reunión con asesoría legal" (antes `BLOCKED`) ahora es `DOING`.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(tasks): reducir TaskStatus a TODO/DOING/DONE con migración de remapeo"
```

---

### Task 2: Alinear el módulo de tareas (schema Zod + service)

**Files:**
- Modify: `backend/src/modules/tasks/tasks.schema.ts:4-11` y `:35`
- Modify: `backend/src/modules/tasks/tasks.service.ts:19-21`

- [ ] **Step 1: Reducir `taskStatusEnum` y el default en `tasks.schema.ts`**

Reemplazar (líneas 4-11):

```ts
export const taskStatusEnum = z.enum(['TODO', 'DOING', 'DONE']);
```

Y en `createTaskSchema` (línea ~35) el default:

```ts
  status: taskStatusEnum.default('TODO'),
```

- [ ] **Step 2: Ajustar `OPEN_STATUSES` en `tasks.service.ts`**

Reemplazar (líneas 19-21):

```ts
// Estado que cuenta como "cerrado" para el cálculo de vencidas.
const OPEN_STATUSES: Prisma.TaskWhereInput['status'] = {
  not: 'DONE',
};
```

- [ ] **Step 3: Verificar typecheck del backend**

Run: `cd backend && npm run build`
Expected: PASS (exit 0). Si falla, será en archivos aún no migrados (dashboard/agent/seed) — se corrigen en las tareas siguientes; este build final pasará al cerrar el chunk.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/tasks
git commit -m "feat(tasks): schema y service con estados TODO/DOING/DONE"
```

---

### Task 3: Alinear el dashboard

**Files:**
- Modify: `backend/src/modules/dashboard/dashboard.service.ts:21-30` y `:49`

- [ ] **Step 1: Reducir `TASK_STATUSES` y `CLOSED_TASK_STATUSES`**

Reemplazar (líneas 21-30):

```ts
const TASK_STATUSES: TaskStatus[] = ['TODO', 'DOING', 'DONE'];

const CLOSED_TASK_STATUSES: TaskStatus[] = ['DONE'];
```

- [ ] **Step 2: Ajustar el conteo de tareas pendientes**

En la línea ~49, el conteo `status: 'PENDING'` (tareas pendientes) pasa a `'TODO'`:

```ts
    prisma.task.count({ where: { ...orgFilter, status: 'TODO' } }),
```

- [ ] **Step 3: Verificar typecheck del backend**

Run: `cd backend && npm run build`
Expected: el error de tipos en `dashboard.service.ts` desaparece (pueden quedar errores en agent/seed, se resuelven luego).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/dashboard
git commit -m "feat(dashboard): conteos de tareas con estados TODO/DOING/DONE"
```

---

### Task 4: Alinear la capa de agente (tools, heurístico, conversión)

**Files:**
- Modify: `backend/src/modules/agent/tools.ts:145-148` y `:167`
- Modify: `backend/src/modules/agent/providers/heuristic.ts` (líneas 113, 119, 348, 356, 364, 424)
- Modify: `backend/src/modules/agent/agent.service.ts:140`

- [ ] **Step 1: Reducir el enum y el filtro de vencidas en `tools.ts`**

En `getTasks.input_schema.properties.status.enum` (líneas 145-148):

```ts
        status: {
          type: 'string',
          enum: ['TODO', 'DOING', 'DONE'],
        },
```

Y el filtro de vencidas (línea ~167):

```ts
      where.status = { not: 'DONE' };
```

- [ ] **Step 2: Reemplazar las 5 ocurrencias de TAREA en `heuristic.ts`**

En cada una de las líneas 113, 119, 356, 364 y 424 (todas sobre `prisma.task`) reemplazar:

```ts
status: { notIn: ['COMPLETED', 'CANCELLED'] },
```
por:
```ts
status: { not: 'DONE' },
```

> **CRÍTICO:** la ocurrencia de la línea ~348 es un `prisma.project.findMany` (proyectos sin próxima acción), de `ProjectStatus`, que NO tiene valor `DONE` — **NO** la toques (rompería el build). Tampoco toques `status: 'BLOCKED'` (~109, ~341, proyecto) ni `notIn: ['WON','LOST']` (~433, oportunidad).

- [ ] **Step 3: Cambiar el estado inicial en `convertProposedTask`**

En `agent.service.ts` línea ~140:

```ts
    status: 'TODO',
```

- [ ] **Step 4: Verificar typecheck del backend**

Run: `cd backend && npm run build`
Expected: desaparecen los errores de la capa de agente.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/agent
git commit -m "feat(agent): herramientas y heurístico con estados TODO/DOING/DONE"
```

---

### Task 5: Actualizar el seed

**Files:**
- Modify: `backend/prisma/seed.ts` (líneas 304, 315, 325, 335, 345, 355, 365, 375, 385)

- [ ] **Step 1: Remapear los `TaskStatus.*` de las tareas sembradas**

Aplicar el mapeo en las 9 tareas:
- `TaskStatus.IN_PROGRESS` (líneas 304, 335) → `TaskStatus.DOING`
- `TaskStatus.PENDING` (líneas 315, 345, 355, 365, 375) → `TaskStatus.TODO`
- `TaskStatus.BLOCKED` (línea 325) → `TaskStatus.DOING`
- `TaskStatus.COMPLETED` (línea 385) → `TaskStatus.DONE`

> NO tocar `ProjectStatus.*`, `SalesStatus.*`, `IncomeStatus.*`, `ExpenseStatus.*`, `DocumentStatus.*` del mismo archivo.

- [ ] **Step 2: Verificar typecheck del backend (build completo del chunk)**

Run: `cd backend && npm run build`
Expected: PASS (exit 0), sin errores en todo el backend.

- [ ] **Step 3: Re-sembrar y comprobar que corre**

Run: `cd backend && npm run prisma:seed`
Expected: termina sin errores; las tareas quedan con estados `TODO`/`DOING`/`DONE`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat(seed): tareas de ejemplo con estados TODO/DOING/DONE"
```

---

## Chunk 2: Frontend — alineación de tipos y presentación con 3 estados

> Al terminar este chunk el frontend compila (`npm run lint`) con el nuevo `TaskStatus` y la tabla/detalle de proyecto funcionan con los 3 estados. Aún sin Kanban.

### Task 6: Reducir el tipo `TaskStatus`

**Files:**
- Modify: `frontend/src/types/domain.ts:17-23`

- [ ] **Step 1: Reemplazar la unión `TaskStatus`**

```ts
export type TaskStatus = 'TODO' | 'DOING' | 'DONE';
```

- [ ] **Step 2: Verificar typecheck (esperando errores guiados)**

Run: `cd frontend && npm run lint`
Expected: FAIL con errores en `lib/domain.ts` (mapa `taskStatus` con claves inválidas) y en los archivos que comparan `'COMPLETED'`/`'CANCELLED'`. Es lo esperado; se corrigen en las tareas siguientes.

- [ ] **Step 3: (sin commit todavía — se commitea junto a la Task 7 para no dejar el repo sin compilar)**

---

### Task 7: Actualizar el mapa de presentación `taskStatus`

**Files:**
- Modify: `frontend/src/lib/domain.ts:49-56`

- [ ] **Step 1: Reemplazar el mapa `taskStatus`**

```ts
export const taskStatus: Record<TaskStatus, Tone> = {
  TODO: { label: 'Por hacer', className: 'bg-slate-100 text-slate-600' },
  DOING: { label: 'Haciendo', className: 'bg-blue-50 text-blue-700' },
  DONE: { label: 'Hecho', className: 'bg-emerald-50 text-emerald-700' },
};
```

> `taskStatusOptions` (línea 152) se regenera solo desde este mapa. `TaskStatusBadge` (en `badges.tsx`) no cambia. `DashboardPage.tsx` recorre las claves de `tasksByStatus` y no requiere edición.

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: desaparecen los errores de `lib/domain.ts`; pueden quedar los de comparaciones `'COMPLETED'`/`'CANCELLED'` en `TasksPage.tsx` y `ProjectDetailPage.tsx` (Tasks 8 y 9).

- [ ] **Step 3: Commit**

> Nota: este commit deja `lib/domain.ts` y los tipos correctos, pero el frontend **todavía no compila del todo** porque `TasksPage.tsx` y `ProjectDetailPage.tsx` aún comparan `'COMPLETED'`/`'CANCELLED'`. El repo vuelve a typechequear completo recién al terminar la Task 9. Es un commit intermedio esperado (mismo criterio que el Chunk 1 backend).

```bash
git add frontend/src/types/domain.ts frontend/src/lib/domain.ts
git commit -m "feat(tasks-ui): TaskStatus reducido a TODO/DOING/DONE y etiquetas del tablero"
```

---

### Task 8: Ajustar la tabla de Tareas (acciones rápidas + vencidas)

**Files:**
- Modify: `frontend/src/pages/tasks/TasksPage.tsx` (acciones rápidas líneas ~178-193; condición de vencidas líneas ~145-148)
- Modify: `frontend/src/pages/tasks/TaskForm.tsx:53`

- [ ] **Step 1: Default del formulario a `TODO`**

En `TaskForm.tsx` línea 53:

```ts
    status: task?.status ?? 'TODO',
```

- [ ] **Step 2: Ajustar la condición de "vencida" en la tabla**

En `TasksPage.tsx` (líneas ~145-148) reemplazar la condición:

```tsx
                  const overdue =
                    isOverdue(task.dueDate) && task.status !== 'DONE';
```

- [ ] **Step 3: Ajustar los botones de acción rápida**

Reemplazar el bloque de los dos botones de estado (titulados hoy "Marcar completada" / "Marcar bloqueada", líneas ~178-193) por acciones coherentes con 3 estados:

```tsx
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Marcar Hecho"
                            onClick={() => quickStatus(task, 'DONE')}
                          >
                            <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Volver a Por hacer"
                            onClick={() => quickStatus(task, 'TODO')}
                          >
                            <RotateCcw className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                          </Button>
```

- [ ] **Step 4: Actualizar los imports de iconos**

En el import de `lucide-react` (línea 2) sustituir `Ban` por `RotateCcw`:

```tsx
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
```

- [ ] **Step 5: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: desaparecen los errores de `TasksPage.tsx` y `TaskForm.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tasks/TasksPage.tsx frontend/src/pages/tasks/TaskForm.tsx
git commit -m "feat(tasks-ui): acciones rápidas y vencidas con estados TODO/DOING/DONE"
```

---

### Task 9: Ajustar el detalle de proyecto

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDetailPage.tsx:145-147`

- [ ] **Step 1: Ajustar la condición de "vencida"**

Reemplazar (líneas 145-147):

```tsx
                          isOverdue(task.dueDate) && task.status !== 'DONE'
```

(El `TaskStatusBadge` de la línea 158 no cambia.)

- [ ] **Step 2: Verificar typecheck (build completo del chunk)**

Run: `cd frontend && npm run lint`
Expected: PASS (exit 0), sin errores en todo el frontend.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/projects/ProjectDetailPage.tsx
git commit -m "feat(projects-ui): vencidas de tareas con estado DONE"
```

---

## Chunk 3: Frontend — Tablero Kanban

> Al terminar este chunk la página de Tareas tiene un toggle Tabla/Kanban; el Kanban muestra 3 columnas por proyecto con drag & drop nativo y actualización optimista.

### Task 10: Hook de movimiento optimista `useMoveTask`

**Files:**
- Modify: `frontend/src/hooks/useTasks.ts`

- [ ] **Step 1: Añadir `useMoveTask` con actualización optimista**

Añadir el import de tipos y la nueva mutación. Tras `useSaveTask` (antes de `useDeleteTask`), insertar:

```ts
export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch(`/tasks/${id}`, { status }),
    // Actualización optimista: mueve la tarjeta de columna al instante.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: KEY });
      for (const [key, tasks] of snapshots) {
        if (!tasks) continue;
        qc.setQueryData<Task[]>(
          key,
          tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      // Si el PATCH falla, revierte al estado previo: la tarjeta "salta" de
      // vuelta a su columna original, lo que señala visualmente el fallo.
      // (No hay sistema de toasts en el proyecto; el rollback + el refetch de
      // onSettled bastan para reflejar el estado real del servidor.)
      context?.snapshots.forEach(([key, tasks]) => {
        qc.setQueryData(key, tasks);
      });
    },
    onSettled: () => invalidateTaskGraph(qc),
  });
}
```

Y ampliar el import de tipos al inicio del archivo:

```ts
import type { Task, TaskStatus } from '@/types/domain';
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useTasks.ts
git commit -m "feat(tasks-ui): mutación optimista useMoveTask para el tablero"
```

---

### Task 11: Componente `TaskCard`

**Files:**
- Create: `frontend/src/pages/tasks/TaskCard.tsx`

- [ ] **Step 1: Crear la tarjeta arrastrable**

```tsx
import { Pencil, Trash2 } from 'lucide-react';
import { PriorityBadge } from '@/components/badges';
import { Button } from '@/components/ui/button';
import { formatDate, isOverdue } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete }: Props) {
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="cursor-grab rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-foreground)]">
          {task.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Editar"
            onClick={() => onEdit(task)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Eliminar"
            onClick={() => onDelete(task)}
          >
            <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PriorityBadge value={task.priority} />
        <span
          className={cn(
            'text-xs',
            overdue
              ? 'font-medium text-[var(--color-danger)]'
              : 'text-[var(--color-muted-foreground)]',
          )}
        >
          {formatDate(task.dueDate)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tasks/TaskCard.tsx
git commit -m "feat(tasks-ui): TaskCard arrastrable para el tablero"
```

---

### Task 12: Componente `BoardColumn`

**Files:**
- Create: `frontend/src/pages/tasks/BoardColumn.tsx`

- [ ] **Step 1: Crear la columna con zona de drop y botón "+"**

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task, TaskStatus } from '@/types/domain';
import { TaskCard } from './TaskCard';

interface Props {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onDropTask: (taskId: string, status: TaskStatus) => void;
  onAdd: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function BoardColumn({
  status,
  title,
  tasks,
  onDropTask,
  onAdd,
  onEditTask,
  onDeleteTask,
}: Props) {
  const [over, setOver] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!over) setOver(true);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) onDropTask(taskId, status);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={[
        'flex w-full flex-col gap-3 rounded-[var(--radius)] border p-3 transition-colors',
        over
          ? 'border-[var(--color-accent)] bg-[var(--color-muted)]/60'
          : 'border-[var(--color-border)] bg-[var(--color-muted)]/30',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          {title}{' '}
          <span className="text-[var(--color-muted-foreground)]">
            ({tasks.length})
          </span>
        </h3>
        <Button
          size="sm"
          variant="ghost"
          title="Nueva tarea en esta columna"
          onClick={() => onAdd(status)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
            Arrastra tareas aquí
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tasks/BoardColumn.tsx
git commit -m "feat(tasks-ui): BoardColumn con drop nativo y alta por columna"
```

---

### Task 13: Componente `TaskBoard`

**Files:**
- Create: `frontend/src/pages/tasks/TaskBoard.tsx`

- [ ] **Step 1: Crear el tablero que agrupa tareas y orquesta el movimiento**

```tsx
import { useMemo } from 'react';
import { useMoveTask } from '@/hooks/useTasks';
import type { Task, TaskStatus } from '@/types/domain';
import { BoardColumn } from './BoardColumn';

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'TODO', title: 'Por hacer' },
  { status: 'DOING', title: 'Haciendo' },
  { status: 'DONE', title: 'Hecho' },
];

interface Props {
  tasks: Task[];
  onAdd: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function TaskBoard({ tasks, onAdd, onEditTask, onDeleteTask }: Props) {
  const moveTask = useMoveTask();

  const byStatus = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = { TODO: [], DOING: [], DONE: [] };
    for (const task of tasks) groups[task.status].push(task);
    return groups;
  }, [tasks]);

  function handleDrop(taskId: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === taskId);
    // No-op si la tarjeta se suelta en su propia columna.
    if (!task || task.status === status) return;
    moveTask.mutate({ id: taskId, status });
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <BoardColumn
          key={col.status}
          status={col.status}
          title={col.title}
          tasks={byStatus[col.status]}
          onDropTask={handleDrop}
          onAdd={onAdd}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tasks/TaskBoard.tsx
git commit -m "feat(tasks-ui): TaskBoard con 3 columnas y movimiento optimista"
```

---

### Task 14: Integrar el toggle Tabla/Kanban en `TasksPage`

**Files:**
- Modify: `frontend/src/pages/tasks/TasksPage.tsx`

- [ ] **Step 1: Añadir estado de vista y estado de columna inicial para alta**

Tras el estado `taskForm` (línea ~30) añadir:

```tsx
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [newStatus, setNewStatus] = useState<Task['status']>('TODO');
```

- [ ] **Step 2: Importar `TaskBoard` y los iconos del toggle**

Añadir el import:

```tsx
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { TaskBoard } from './TaskBoard';
```

(añadir `LayoutGrid` y `Table as TableIcon` al import existente de `lucide-react`).

- [ ] **Step 3: Añadir el control de toggle junto a los filtros**

Dentro de la `Card` de filtros (tras el grid de selects, antes de cerrar la Card) añadir:

```tsx
        <div className="mt-3 flex justify-end gap-1">
          <Button
            size="sm"
            variant={view === 'table' ? 'primary' : 'outline'}
            onClick={() => setView('table')}
          >
            <TableIcon className="h-4 w-4" /> Tabla
          </Button>
          <Button
            size="sm"
            variant={view === 'kanban' ? 'primary' : 'outline'}
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="h-4 w-4" /> Kanban
          </Button>
        </div>
```

- [ ] **Step 4: Añadir un handler de alta por columna**

Junto a `quickStatus`/`handleDelete` añadir:

```tsx
  function handleAddInColumn(status: Task['status']) {
    setNewStatus(status);
    setTaskForm({ open: true, task: null });
  }
```

- [ ] **Step 5: Renderizar condicionalmente tabla o tablero**

Cambio exacto: en la línea ~128, la condición de apertura del bloque de tabla
`{data && data.length > 0 && (` pasa a `{view === 'table' && data && data.length > 0 && (`.
El contenido de la `<Card>` con la tabla (líneas ~129-218) **no se modifica**; solo se antepone `view === 'table' &&` al guard. La lógica de carga/error (`isLoading`/`isError`, líneas ~119-120) se mantiene arriba sin cambios. Luego se añade la rama Kanban justo después. Estructura resultante:

```tsx
      {view === 'table' && data && data.length > 0 && (
        /* el <Card> con la tabla existente, sin cambios internos */
      )}

      {view === 'kanban' && (
        !filters.projectId ? (
          <EmptyState title="Selecciona un proyecto">
            El tablero Kanban se organiza por proyecto. Elige un proyecto en los
            filtros para ver su tablero.
          </EmptyState>
        ) : data ? (
          <TaskBoard
            tasks={data}
            onAdd={handleAddInColumn}
            onEditTask={(task) => setTaskForm({ open: true, task })}
            onDeleteTask={handleDelete}
          />
        ) : null
      )}
```

> Nota: el `EmptyState` "Sin tareas" actual (líneas ~122-126) debe limitarse a la vista tabla (envolver con `view === 'table' &&`) para no chocar con la rama Kanban.

- [ ] **Step 6: Pasar el estado inicial al `TaskForm`**

En el render del `TaskForm` (final del componente), pasar el proyecto del filtro y el estado de la columna como defaults al crear:

```tsx
      {taskForm.open && (
        <TaskForm
          open={taskForm.open}
          onClose={() => setTaskForm({ open: false, task: null })}
          task={taskForm.task}
          defaultOrganizationId={filters.organizationId}
          defaultProjectId={filters.projectId}
          defaultStatus={!taskForm.task ? newStatus : undefined}
          lockContext={view === 'kanban' && !taskForm.task && !!filters.projectId}
        />
      )}
```

> El `lockContext` bloquea empresa/proyecto al **crear** desde una columna del Kanban (honra el "una por proyecto" del spec). La guarda `!!filters.projectId` evita bloquear cuando no hay proyecto (en cuyo caso el Kanban muestra el aviso y no hay columnas), y como el select de proyecto solo se habilita con empresa elegida, `projectId` implica `organizationId`. Al **editar** (`taskForm.task` definido) no se bloquea.

- [ ] **Step 7: Soportar `defaultStatus` en `TaskForm`**

En `TaskForm.tsx`: añadir `defaultStatus?: Task['status']` a `Props` (tras `defaultProjectId`), y usarlo en el estado inicial (línea 53):

```tsx
    status: task?.status ?? defaultStatus ?? 'TODO',
```

- [ ] **Step 8: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (exit 0).

- [ ] **Step 9: Verificación manual end-to-end**

Levantar backend (`cd backend && npm run dev`) y frontend (`cd frontend && npm run dev`), entrar con el usuario del seed, ir a Tareas:
- El toggle alterna Tabla/Kanban.
- En Kanban sin proyecto seleccionado se ve el aviso; al elegir empresa + proyecto aparecen las 3 columnas con las tareas.
- Arrastrar una tarjeta a otra columna la mueve al instante y persiste tras recargar.
- El botón "+" de una columna abre el formulario con esa columna y el proyecto preseleccionados.
- Editar/eliminar desde una tarjeta funciona.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/tasks/TasksPage.tsx frontend/src/pages/tasks/TaskForm.tsx
git commit -m "feat(tasks-ui): toggle Tabla/Kanban y alta por columna en la página de Tareas"
```

---

## Cierre

- [ ] **Verificación final de typecheck en ambos paquetes**

Run: `cd backend && npm run build` y `cd frontend && npm run lint`
Expected: ambos PASS (exit 0).

- [ ] **Push**

```bash
git push
```

## Fuera de alcance (recordatorio del spec)

Columnas configurables, reordenamiento dentro de una columna, drag & drop táctil/móvil avanzado, y conservar `CANCELLED` como estado separado. No implementar en este plan.
