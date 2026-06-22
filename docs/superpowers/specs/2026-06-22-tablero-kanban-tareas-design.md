# Diseño: Tablero Kanban en el módulo de Tareas

- **Fecha:** 2026-06-22
- **Estado:** Aprobado para planificación
- **Autor:** CEO (a.bustos@vitam.tech) + Claude Code

## 1. Objetivo

Ofrecer en el módulo de Tareas un **tablero Kanban de 3 columnas** —Por hacer, Haciendo, Hecho— con arrastre de tarjetas, además de la tabla actual. El tablero se muestra **por proyecto** (un tablero por proyecto) mediante un **toggle Tabla↔Kanban** en la página de Tareas.

Para que el tablero tenga 3 columnas limpias, se **simplifica el modelo de estados de tarea de 6 a 3** (`TODO` / `DOING` / `DONE`).

## 2. Decisiones tomadas (brainstorming)

| Decisión | Elección |
| --- | --- |
| Estados → columnas | Simplificar el enum a 3 estados (`TODO`/`DOING`/`DONE`) |
| Acceso al tablero | Toggle Tabla↔Kanban en la página de Tareas; el Kanban exige un proyecto seleccionado |
| Interacción | Drag & drop nativo HTML5 (sin dependencias) |
| Migración de datos | `BLOCKED`/`IN_REVIEW → DOING`, `CANCELLED → DONE` |
| Actualización UI al soltar | Optimista (rollback ante error) |

## 3. Modelo de datos (Prisma)

`enum TaskStatus` pasa de 6 valores a 3:

```prisma
enum TaskStatus {
  TODO
  DOING
  DONE
}
```

- `Task.status`: el default cambia de `@default(PENDING)` a `@default(TODO)`.
- Se conserva el índice `@@index([status])`.

### Migración con remapeo de datos

Una sola migración (`prisma migrate dev`) que **preserva las tareas existentes** según este mapeo:

| Estado anterior | Estado nuevo |
| --- | --- |
| `PENDING` | `TODO` |
| `IN_PROGRESS` | `DOING` |
| `BLOCKED` | `DOING` |
| `IN_REVIEW` | `DOING` |
| `COMPLETED` | `DONE` |
| `CANCELLED` | `DONE` |

PostgreSQL no permite eliminar valores de un enum en uso, por lo que la migración SQL debe:
1. Crear el tipo enum nuevo (`TaskStatus_new` con TODO/DOING/DONE).
2. Quitar el default de la columna `status`.
3. `ALTER COLUMN status TYPE TaskStatus_new USING` con un `CASE` que aplique el mapeo de arriba.
4. Renombrar el tipo nuevo a `TaskStatus` y eliminar el viejo.
5. Restablecer el default a `TODO`.

Contexto de riesgo: plataforma de un solo usuario, sin tests automatizados ni datos de producción críticos. El remapeo evita perder tareas; aun así se verifica manualmente con `prisma studio` tras migrar.

## 4. Impacto en backend

Cambios derivados de la reducción de estados (el enum `TaskStatus` es independiente de los estados de proyectos, finanzas, etc., que **no** se tocan):

- **`modules/tasks/tasks.schema.ts`**: `taskStatusEnum` → `z.enum(['TODO','DOING','DONE'])`; `createTaskSchema.status` default `'TODO'`.
- **`modules/tasks/tasks.service.ts`**: `OPEN_STATUSES` (cálculo de tareas vencidas) pasa de `{ notIn: ['COMPLETED','CANCELLED'] }` a `{ not: 'DONE' }`.
- **`modules/dashboard/dashboard.service.ts`**:
  - `TASK_STATUSES` → `['TODO','DOING','DONE']`.
  - `CLOSED_TASK_STATUSES` → `['DONE']`.
  - El conteo de "tareas pendientes" `status: 'PENDING'` → `status: 'TODO'`.
- **`modules/agent/tools.ts`**: el `enum` del parámetro `status` de la tool `getTasks` → 3 valores; el filtro de vencidas `notIn: ['COMPLETED','CANCELLED']` → `not: 'DONE'`.
- **`modules/agent/providers/heuristic.ts`**: las **5** ocurrencias de `notIn: ['COMPLETED','CANCELLED']` **sobre `prisma.task`** (tareas abiertas/vencidas/críticas/próximas, líneas 113, 119, 356, 364, 424) → `not: 'DONE'`. **OJO:** la ocurrencia de la línea ~348 es un `prisma.project.findMany` (ProjectStatus, que no tiene `DONE`) y **NO** se toca.
- **`modules/agent/agent.service.ts`** (edición confirmada): `convertProposedTask` fija `status: 'PENDING'` al crear la tarea real (~línea 140) → cambiar a `'TODO'`.
- **`prisma/seed.ts`** (edición confirmada): usa miembros del enum `TaskStatus` (`TaskStatus.PENDING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, líneas ~304-385) al sembrar tareas → remapear a `TODO`/`DOING`/`DONE`. Los usos de `ProjectStatus.*` y `ExpenseStatus.*` en el mismo archivo se dejan intactos.

## 5. Impacto en frontend (tipos y dominio)

- **`types/domain.ts`**: `TaskStatus` → `'TODO' | 'DOING' | 'DONE'`. `DashboardSummary.tasksByStatus` (`Record<TaskStatus, number>`) se ajusta automáticamente.
- **`lib/domain.ts`**: mapa `taskStatus` con 3 entradas:
  - `TODO` → "Por hacer" (tono slate)
  - `DOING` → "Haciendo" (tono azul)
  - `DONE` → "Hecho" (tono verde/emerald)
  - `taskStatusOptions` se regenera desde ese mapa (lo consumen `TaskForm` y el filtro de estado de la tabla).
- **`components/badges.tsx`**: `TaskStatusBadge` no cambia (lee el mapa actualizado).
- **`pages/DashboardPage.tsx`**: no requiere edición — recorre `tasksByStatus` con un lookup al mapa (`taskStatusMap[k as TaskStatus]`), sin literales fijos; se adapta solo al actualizar `lib/domain.ts` y el dashboard del backend.
- **`TaskForm.tsx`**: estado inicial `status: 'TODO'`; el select de estado queda con 3 opciones.
- **`TasksPage.tsx` (tabla)**: los botones de acción rápida actuales (✓ Completar → `COMPLETED`, 🚫 Bloquear → `BLOCKED`) se ajustan a los nuevos estados (p. ej. "Marcar Hecho" → `DONE`, "Volver a Por hacer" → `TODO`). Además, la condición de resaltado de vencidas `task.status !== 'COMPLETED' && task.status !== 'CANCELLED'` (líneas ~147-148) pasa a `task.status !== 'DONE'`.
- **`pages/projects/ProjectDetailPage.tsx`**: contiene la **misma** condición de vencidas `task.status !== 'COMPLETED' && task.status !== 'CANCELLED'` (líneas ~146-147) → `task.status !== 'DONE'`, y un `TaskStatusBadge` (lee el mapa actualizado). No tiene botones de acción rápida de estado, así que solo cambian esa comparación y el badge.

## 6. Tablero Kanban

### Ubicación y toggle

En `TasksPage.tsx` se añade un estado local de vista `'table' | 'kanban'` con un control para alternar, junto a la barra de filtros existente.

### Regla "una por proyecto"

- El Kanban solo se renderiza si el filtro tiene un `projectId` seleccionado.
- Si no hay proyecto seleccionado, se muestra un aviso ("Selecciona un proyecto para ver su tablero") en lugar del tablero.
- Las tareas sin proyecto siguen siendo visibles en la vista de tabla.

### Componentes nuevos (`frontend/src/pages/tasks/`)

- **`TaskBoard.tsx`**: recibe las tareas del proyecto (vía `useTasks({ projectId, ...filtrosOpcionales })`), las agrupa en 3 listas por `status` y orquesta el drag & drop. Respeta los filtros de prioridad/vencidas ya existentes en la página.
- **`BoardColumn.tsx`**: una columna (título + contador + zona de drop con `onDragOver`/`onDrop`). Incluye un botón "+ " que abre `TaskForm` con:
  - `status` preseleccionado al de la columna,
  - `organizationId`/`projectId` bloqueados (`lockContext`, `defaultProjectId`, `defaultOrganizationId`).
- **`TaskCard.tsx`**: tarjeta `draggable` (`onDragStart` guarda el `taskId`) con título, `PriorityBadge`, vencimiento (resaltado si está vencida y no en `DONE`) y acciones editar/eliminar. La tarjeta **no** posee estado de modal: emite callbacks `onEdit(task)` / `onDelete(task)` hacia arriba. El estado del `TaskForm` (abrir/cerrar, tarea en edición) vive en `TasksPage.tsx`, como hoy, y se pasa a `TaskBoard` → columnas → tarjetas.

### Drag & drop nativo

- `onDragStart` en la tarjeta: `e.dataTransfer.setData('text/plain', taskId)`.
- `onDragOver` en la columna: `e.preventDefault()` para permitir el drop.
- `onDrop` en la columna: lee el `taskId`, y si la columna destino difiere del estado actual de la tarea, dispara la mutación de cambio de estado. Soltar en la misma columna es un no-op (sin llamada al servidor).

### Actualización optimista (`hooks/useTasks.ts`)

Nueva mutación **`useMoveTask`** (mutación dedicada, separada de `useSaveTask`, para aislar la lógica optimista; `useSaveTask` sigue usándose para alta/edición y para los botones de acción rápida de la tabla):
- `onMutate(payload)`: `cancelQueries(['tasks'])`, snapshot del estado previo de la caché, y actualización inmediata moviendo la tarea al nuevo `status`.
- `onError`: restaura el snapshot y propaga el error para mostrar feedback.
- `onSettled`: invalida el grafo relacionado (`['tasks']`, `['projects']`, `['dashboard']`) para reconciliar con el servidor.

## 7. Manejo de errores y casos borde

- Fallo del `PATCH` al arrastrar → rollback visual + mensaje (componentes de feedback existentes).
- Proyecto sin tareas → columnas vacías con placeholder, no error.
- Cambio de proyecto/empresa en el filtro estando en Kanban → recarga de tareas del nuevo proyecto.
- Soltar en la misma columna → no-op.

## 8. Verificación

No hay framework de tests; la verificación es manual + typecheck:
- **Backend**: `npm run build` (typecheck); `npm run prisma:migrate` aplicando el remapeo; comprobación con `prisma studio` de que los estados se convirtieron correctamente; sanity check de dashboard y agente.
- **Frontend**: `npm run lint` (`tsc --noEmit`); prueba manual de arrastre entre columnas, alta de tarea por columna, toggle tabla/kanban, y resaltado de vencidas.

## 9. Archivos afectados

**Backend:** `prisma/schema.prisma`, nueva migración en `prisma/migrations/`, `modules/tasks/tasks.schema.ts`, `modules/tasks/tasks.service.ts`, `modules/dashboard/dashboard.service.ts`, `modules/agent/tools.ts`, `modules/agent/providers/heuristic.ts`, `modules/agent/agent.service.ts`, `prisma/seed.ts`.

**Frontend:** `types/domain.ts`, `lib/domain.ts`, `pages/tasks/TasksPage.tsx`, `pages/tasks/TaskForm.tsx`, `pages/projects/ProjectDetailPage.tsx`, `hooks/useTasks.ts`; nuevos `pages/tasks/TaskBoard.tsx`, `pages/tasks/BoardColumn.tsx`, `pages/tasks/TaskCard.tsx`.

## 10. Fuera de alcance (YAGNI)

- Columnas configurables por proyecto.
- Reordenamiento manual dentro de una columna (orden por defecto: el actual `dueDate` asc / `createdAt`).
- Drag & drop táctil avanzado (móvil) o con librería externa.
- Conservar `CANCELLED` como estado separado.
