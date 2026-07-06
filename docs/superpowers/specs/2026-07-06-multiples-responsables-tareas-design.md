# Múltiples responsables por tarea — Diseño

**Fecha:** 2026-07-06
**Estado:** Aprobado (brainstorming), pendiente de plan de implementación

## Problema

Hoy una `Task` tiene **un solo** responsable (`ownerId String?`, FK a `User`, relación `TaskOwner`). En la práctica varias tareas involucran a más de una persona, y forzar un único responsable obliga a elegir arbitrariamente a uno o a dejar fuera a los demás. Se necesita poder asignar **varios responsables** a una misma tarea.

## Objetivo

Que una tarea pueda tener **cero, uno o varios responsables**, todos con el mismo peso (set plano), eligiéndolos de la lista de usuarios registrados. El cambio se apoya en el patrón que ya usan las **etiquetas** (`TaskLabel`) para no inventar convenciones nuevas. Los proyectos quedan fuera de alcance: mantienen su responsable único actual.

## Decisiones tomadas (brainstorming)

| # | Decisión | Resolución |
|---|----------|-----------|
| 1 | ¿Todos iguales o principal + colaboradores? | **Set plano**: todos los responsables tienen el mismo peso. |
| 2 | ¿Aplica a tareas o también a proyectos? | **Solo tareas**. Proyectos mantienen `ownerId` único sin cambios. |
| 3 | ¿Detalle en el registro de actividad? | **Detallado por persona**: `ASSIGNEE_ADDED` / `ASSIGNEE_REMOVED`, uno por alta/baja, igual que las etiquetas. |
| 4 | ¿Qué pasa con los responsables actuales? | **Migración sin pérdida**: cada `ownerId` actual se copia como asignado antes de borrar la columna. |

## Principio rector: no perder datos

La única operación destructiva es el `DROP COLUMN ownerId`. Se blinda así:

1. **Copiar antes de borrar.** La migración crea la tabla intermedia, copia los responsables existentes y **recién después** borra la columna (patrón expand → migrate → contract dentro de un mismo archivo de migración).
2. **Atomicidad garantizada.** Prisma envuelve cada migración en una transacción y PostgreSQL soporta DDL transaccional: si el `INSERT` de copia fallara, el `DROP COLUMN` hace rollback y `ownerId` se conserva intacto. No hay ventana en la que los datos queden a medio migrar.
3. **Respaldo previo.** Antes de correr `prisma:migrate`, el plan hará un `pg_dump` de la BD `vitamcore` a un archivo, para poder restaurar si algo falla.
4. **Verificación post-copia.** Confirmar que el número de filas en `task_assignees` coincide con la cantidad de tareas que tenían `ownerId` no nulo antes de la migración.

Ninguna otra tabla se toca (proyectos, finanzas, etiquetas, etc. quedan intactos).

## Modelo de datos

En `backend/prisma/schema.prisma`:

### Nueva tabla intermedia `TaskAssignee` (espejo de `TaskLabel`)

```prisma
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

- `onDelete: Cascade` en ambos lados: si se borra la tarea o el usuario, la fila de asignación desaparece (no deja huérfanos). Es coherente con `TaskLabel`.
  - Nota: hoy `Task.owner` usaba `onDelete: SetNull` (borrar/… un usuario dejaba la tarea sin responsable pero viva). Con la tabla intermedia el equivalente natural es `Cascade` sobre la fila de unión: se elimina la asignación de ese usuario, la tarea sigue viva. El comportamiento observable es el mismo (la tarea no se borra), solo cambia el mecanismo.

### Cambios en `Task`

- **Eliminar**: columna `ownerId`, relación `owner` (`TaskOwner`), e `@@index([ownerId])`.
- **Añadir**: back-relation `assignees TaskAssignee[]`.

### Cambios en `User`

- **Eliminar**: `ownedTasks Task[] @relation("TaskOwner")`.
- **Añadir**: `assignedTasks TaskAssignee[] @relation("TaskAssignee")`.
- Se mantiene intacto `ownedProjects` (proyectos siguen con responsable único).

### Migración (expand → migrate → contract, editada a mano)

`prisma migrate dev` autogeneraría un diff destructivo que borraría `ownerId` antes de poder copiarlo. Por eso la migración se crea con **`prisma migrate dev --create-only`** y se **edita a mano** para intercalar el paso de datos. Orden dentro del archivo:

1. `CREATE TABLE "task_assignees"` con su PK compuesta e índice, más las FKs (task y user).
2. Paso de datos: `INSERT INTO "task_assignees" ("taskId", "userId") SELECT "id", "ownerId" FROM "tasks" WHERE "ownerId" IS NOT NULL;`
3. `ALTER TABLE "tasks" DROP COLUMN "ownerId";` — en PostgreSQL esto elimina automáticamente el índice `tasks_ownerId_idx` y la FK `tasks_ownerId_fkey`, así que no hace falta un `DROP INDEX`/`DROP CONSTRAINT` explícito.

Al hand-editar el `--create-only`, verificar que la SQL final no genere drift contra `schema.prisma` (Prisma valida contra la shadow DB al aplicar).

Tras editar, se aplica con `prisma:migrate` y se corre `prisma:generate`.

## Backend

### Validación de coherencia (`modules/shared/relations.ts`)

- El helper actual `assertAssignableUser(ownerId)` valida un solo id. Se generaliza a **`assertAssignableUsers(userIds: string[])`**: si el array trae ids, verifica que **todos** existan como `User` (una sola query `findMany` + comparación de conteo); si falta alguno, `badRequest`. Se mantiene la semántica actual ("existe", no "existe y activo": la restricción de solo-activos vive en `/assignees`, que puebla el picker).
- **Deduplicar antes de validar**: el service normaliza `assigneeIds` con `[...new Set(assigneeIds)]` antes de llamar al assert y de `createMany`. Sin esto, ids repetidos darían un falso `badRequest` (el `findMany` deduplica por id, y `found.length !== ids.length`) y violarían la PK compuesta `@@id([taskId, userId])` en el insert.

### Tareas (`modules/tasks/`)

- **`tasks.schema.ts`**:
  - `createTaskSchema`: reemplazar `ownerId` por `assigneeIds: z.array(z.string().min(1)).optional()`.
  - `updateTaskSchema` lo hereda vía `.partial()` (si viene, reemplaza el set completo; si no viene, no se toca).
  - `listTasksQuery`: reemplazar `ownerId` por `assigneeId: z.string().optional()` (filtra tareas donde ese usuario es responsable). Mantiene el filtro "mis tareas".
- **`tasks.service.ts`**:
  - `create`/`update`: extraer `assigneeIds` del input junto a `labelIds` (`const { labelIds, assigneeIds, ...data } = input;`) para que **no** llegue a `tx.task.create/update({ data })` (no es columna de `Task`). Validar con `assertAssignableUsers(assigneeIds)`. Reemplazar el set completo igual que las etiquetas: dentro de la transacción, `taskAssignee.deleteMany({ taskId })` + `createMany` de los nuevos. En `create` solo `createMany` si el array trae elementos.
  - `list`: aplicar el filtro **condicionalmente** — `if (filters.assigneeId) where.assignees = { some: { userId: filters.assigneeId } };` — y quitar `ownerId` del objeto literal `where`. Importante: no dejarlo inline con `undefined`, porque `{ some: { userId: undefined } }` colapsa a `{ some: {} }` = "tiene al menos un responsable", lo que excluiría del listado general todas las tareas sin responsable.
  - `include` en `list` y `getById`: reemplazar `owner: { select: { id, name } }` por `assignees: { include: { user: { select: { id: true, name: true } } } }`.
  - En `update`, la lectura de `current` ya no selecciona `ownerId`; en su lugar selecciona `assignees: { select: { userId: true } }` para poder diferenciar altas/bajas en la actividad.

### Actividad (`modules/tasks/task-activity.service.ts`)

- Añadir al enum `TaskActivityType` (schema.prisma) los valores `ASSIGNEE_ADDED` y `ASSIGNEE_REMOVED`. Se **conserva** `ASSIGNED` en el enum para no romper eventos históricos ya persistidos (aunque deje de emitirse).
- `diffScalarEvents` deja de mirar `ownerId`, y el tipo `ScalarState` (en `task-activity.service.ts`) deja de incluir `ownerId`. En paralelo, el parámetro `prev` de `buildUpdateEvents` (`tasks.service.ts`) deja de tipar `ownerId` y pasa a recibir `assignees: { userId: string }[]`.
- La diferencia de responsables se calcula en `tasks.service` con la misma mecánica que las etiquetas en `buildUpdateEvents`: comparar el set previo (`current.assignees`) con `assigneeIds` (deduplicado), y por cada alta/baja emitir `ASSIGNEE_ADDED` / `ASSIGNEE_REMOVED` con `data: { userId, name }` (los nombres se resuelven con un `findMany` de los usuarios afectados).

### Agente (`modules/agent/agent.service.ts`)

- En `convertProposedTask`, quitar `ownerId: null` del payload de `createTask` (la IA crea la tarea sin responsables; se asignan luego manualmente). No requiere `assigneeIds`.

## Frontend

- **Tipos** (`types/core.ts`):
  - `Task`: eliminar `ownerId` y `owner`; añadir `assignees: { user: Ref }[]`.
  - `TaskActivityType`: añadir `'ASSIGNEE_ADDED' | 'ASSIGNEE_REMOVED'`.
- **Nuevo componente `AssigneePicker`** (`components/tasks/`): calcado de `LabelPicker` (chips toggle sobre la lista de `useAssignees()`), pero **sin** el bloque de "crear". Props: `selected: string[]`, `onChange: (ids) => void`. Emite el array completo de ids.
- **Display de responsables**: un pequeño stack de avatares (iniciales, reutilizando el helper `initials` de `TaskCard`) con "+X" cuando sobran. Se extrae a un componente reutilizable (`AssigneeAvatars`) usado por `TaskCard` y la tabla.
- **`TaskForm`**: reemplazar el `<Select>` de "Responsable" por `AssigneePicker`; el estado pasa de `ownerId: string` a `assigneeIds: string[]`; el submit envía `assigneeIds`.
- **`TaskPanel`**: reemplazar el `<Select>` de "Responsable" por `AssigneePicker`; `patch({ assigneeIds })`.
- **`TaskCard`**: el avatar único (`task.owner`) pasa a `AssigneeAvatars` sobre `task.assignees`.
- **`TasksTableView`**: la columna "Responsable" muestra los nombres/avatares de `task.assignees` (o "—" si vacío).
- **`TasksPage`** (filtro "mis tareas"): el toggle pasa a setear `assigneeId: user?.id` en vez de `ownerId`.
- **`useTasks.ts`**: en el tipo de filtros, `ownerId?: string` → `assigneeId?: string`.
- **`lib/taskActivity.ts`**: añadir textos para los nuevos tipos, p. ej. `ASSIGNEE_ADDED` → "agregó a {nombre} como responsable", `ASSIGNEE_REMOVED` → "quitó a {nombre} de responsables" (leyendo `data.name`). Mantener el texto de `ASSIGNED` para eventos históricos.

## Fuera de alcance (YAGNI)

- Responsable "principal" o jerarquía entre responsables (se decidió set plano).
- Múltiples responsables en **proyectos**.
- Notificaciones al asignar/desasignar.
- Reportes de carga por persona (el modelo queda listo, pero no se construyen ahora).

## Verificación

- **Respaldo**: `pg_dump` de `vitamcore` a archivo antes de migrar; verificación del conteo `task_assignees` vs. tareas con `ownerId` no nulo.
- **Backend**: `npm run build` (typecheck) + `npm test`. Adaptar dos suites:
  - `backend/test/tasks.service.test.ts`: los casos que hoy usan `ownerId`/filtran por `ownerId` pasan a `assigneeIds`/`assigneeId`. Añadir cobertura de: crear con varios responsables, reemplazo de set en update, dedupe de ids repetidos, filtro sin `assigneeId` que **sí** incluye tareas sin responsable, y eventos `ASSIGNEE_ADDED`/`ASSIGNEE_REMOVED`.
  - `backend/test/task-activity.service.test.ts`: hoy prueba `diffScalarEvents(..., { ownerId })` y su fixture `ScalarState` incluye `ownerId`; ambos deben adaptarse (quitar `ownerId` del fixture y reemplazar el caso `ASSIGNED` por la nueva lógica de altas/bajas, que ahora vive en `tasks.service`).
- **Frontend**: `npm run lint` (typecheck) + `vite build`. Smoke manual: crear/editar tarea asignando varias personas, ver los avatares en tarjeta y tabla, filtro "mis tareas", y el historial de actividad reflejando altas/bajas.
