# Gestión de tareas rica e integrada — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado (brainstorming), pendiente de plan de implementación

## Problema

Los módulos de Proyectos y Tareas funcionan (CRUD, Kanban con drag&drop nativo, responsable por usuario, auto-estado de proyecto), pero las tarjetas de tarea son pobres y el trabajo está fragmentado:

- La tarjeta solo tiene título, prioridad y fecha de vencimiento. No hay forma de clasificar (etiquetas), desglosar (checklist), ni conversar/auditar (comentarios/actividad).
- Al hacer clic en una tarea se abre un formulario modal de edición; no existe una vista de "tarjeta abierta" con todo su contexto.
- No hay búsqueda de texto en tareas (solo filtros por select).
- El detalle del proyecto muestra sus tareas como una lista pobre (título + badge) que solo abre el modal; no se puede trabajar el proyecto desde ahí.

## Objetivo

Convertir la gestión de tareas en un sistema rico e integrado (inspirado en Trello, pero acotado a lo que sirve): tarjetas con etiquetas, checklist y fechas; un **panel de tarjeta** para ver/editar todo su detalle; búsqueda de tareas; historial de actividad con comentarios; y un detalle de proyecto que se vuelve el **centro de trabajo** de ese proyecto (mismas vistas lista/tablero, acotadas y con el mismo panel de tarjeta).

**Explícitamente fuera de alcance** (descartado en brainstorming): columnas/listas configurables, reordenar tarjetas arrastrando (persistir posición), adjuntos de archivos (bloqueado por falta de almacenamiento real S3/R2), múltiples responsables, dependencias entre tareas, recurrencia, tiempo real/websockets.

## Decisiones tomadas (brainstorming)

| # | Decisión | Resolución |
|---|----------|-----------|
| 1 | Elementos de la tarjeta rica | **Etiquetas de color, checklist/subtareas, fecha de inicio.** (Adjuntos NO.) |
| 2 | ¿Comentarios además de actividad? | **Sí:** feed único actividad + comentarios en el panel. |
| 3 | Vista de tareas dentro del proyecto | **Lista rica + tablero Kanban** acotados al proyecto (mismas vistas que la página global). |
| 4 | Forma de entrega | **Por fases**, un solo spec, plan dividido en fases usables. |
| 5 | Alcance de etiquetas | **Por empresa** (`organizationId`). |
| 6 | Checklist | **Plana y única por tarjeta** (no múltiples checklists nombradas). |
| 7 | Panel de tarjeta | **Drawer lateral** (se desliza desde la derecha), no modal centrado. |

## Modelo de datos (`backend/prisma/schema.prisma`)

### Cambios en `Task`
- Añadir `startDate DateTime?` (fecha de inicio, junto al `dueDate` existente).
- Nuevas back-relations: `labels TaskLabel[]`, `checklistItems ChecklistItem[]`, `comments TaskComment[]`, `activity TaskActivity[]`.

### Nuevas entidades

**`Label`** — etiqueta reutilizable, por empresa.
```prisma
model Label {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  color          String   // clave de una paleta fija (ver más abajo)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  tasks        TaskLabel[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("labels")
}
```

**`TaskLabel`** — puente muchos-a-muchos Task ↔ Label.
```prisma
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

**`ChecklistItem`** — ítem de checklist plana, ordenada.
```prisma
model ChecklistItem {
  id        String   @id @default(cuid())
  taskId    String
  text      String
  done      Boolean  @default(false)
  position  Int      // orden dentro de la checklist de la tarea
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@map("checklist_items")
}
```

**`TaskComment`** — comentario manual de un usuario.
```prisma
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
```

**`TaskActivity`** — evento de historial (auto-registrado).
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

model TaskActivity {
  id        String           @id @default(cuid())
  taskId    String
  actorId   String?          // usuario que hizo el cambio (null si no aplica)
  type      TaskActivityType
  data      Json?            // detalle: { from, to, labelName, ... }
  createdAt DateTime         @default(now())

  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actor User? @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([taskId])
  @@map("task_activity")
}
```

`User` gana las back-relations `comments TaskComment[] @relation("CommentAuthor")` y `activity TaskActivity[] @relation("ActivityActor")`. `Organization` gana `labels Label[]`.

### Paleta de colores de etiquetas
Constante compartida (backend `modules/shared/` + frontend `lib/`): ~10 claves fijas (`red, orange, yellow, green, teal, blue, purple, pink, gray, brown`). El schema guarda la clave (`color: String`); el frontend mapea clave → clase Tailwind. Zod valida contra el conjunto de claves.

## Backend / API

### Autoría de acciones (cambio transversal)
Actividad y comentarios requieren saber **quién** ejecuta la acción. Hoy los services de tasks no reciben el usuario. Se pasará `req.user.id` desde el controller al service en las operaciones que lo necesitan:
- `create(input, actorId?)` y `update(id, input, actorId?)` reciben el actor (**opcional**, `string | null`) para registrar `TaskActivity`.
- **Compatibilidad con el agente**: `agent.service.ts` llama hoy a `createTask({...})` con un solo argumento (`agent.service.ts:~134`). Como `actorId` es opcional, esa llamada sigue compilando; se actualiza explícitamente para pasar `null` (origen IA). Es la única firma compartida fuera del controller.
- Comentarios: `createComment(taskId, body, authorId)`.

El registro de actividad se hace **dentro de la misma transacción** que la mutación (helper `recordActivity(tx, taskId, actorId, type, data)` en un nuevo `modules/tasks/task-activity.service.ts`), comparando el estado previo con el nuevo para emitir solo los eventos que corresponden. Para poder comparar, el `update` amplía el `select` del estado previo (`current`) de `{ id, organizationId, projectId }` a incluir también `status`, `dueDate`, `startDate`, `ownerId` y las labels previas.

**Ojo de fasedo**: aunque `startDate` y las labels se crean en Fase 1, el registro de actividad (`recordActivity`) y el enum `TaskActivityType` viven en **Fase 3**. Fase 1 y Fase 2 **no** registran actividad todavía (el feed no existe aún).

### Módulo `labels` (`modules/labels/`)
CRUD por empresa siguiendo el patrón de 4 archivos:
- `GET /api/labels?organizationId=` — lista las etiquetas de una empresa.
- `POST /api/labels` — crea `{ organizationId, name, color }` (color validado contra la paleta; `P2002` → badRequest por nombre duplicado en la empresa).
- `PATCH /api/labels/:id` — renombrar / cambiar color.
- `DELETE /api/labels/:id` — elimina la etiqueta (y sus `TaskLabel` por cascade).
- Acceso: `requireRole(...ALL_ROLES)` (colaboradores gestionan etiquetas de sus proyectos/tareas). Montado junto a tasks/projects.

### Tareas (`modules/tasks/`)
- `tasks.schema.ts`: `create`/`update` aceptan `startDate` (dateInput) y `labelIds: string[]` opcional. `listTasksQuery` gana `search: string` opcional.
- `tasks.service.ts`:
  - `list`: filtro `search` → `where.OR = [{ title: { contains, mode: 'insensitive' } }, { description: { contains, mode: 'insensitive' } }]`. Include suma `labels: { include: { label: true } }` y `_count` de `checklistItems` (+ los completados para el progreso).
  - `getById` (detalle para el panel): include labels, checklistItems (ordenados por `position`), comments (con autor, desc), activity (con actor, desc). Se puede exponer un endpoint combinado o el propio `getById` enriquecido.
  - `create`/`update`: sincronizan `labelIds` (crear/borrar filas `TaskLabel`), validan que cada label pertenezca a la misma empresa (helper en `shared/relations.ts`), y registran actividad vía `recordActivity`.
- **Checklist** (`modules/tasks/checklist.service.ts` + rutas): `POST /tasks/:id/checklist` (crea ítem al final), `PATCH /tasks/:id/checklist/:itemId` (toggle done / renombrar / mover `position`), `DELETE /tasks/:id/checklist/:itemId`.
- **Comentarios** (`modules/tasks/comments.service.ts` + rutas): `GET /tasks/:id/comments`, `POST /tasks/:id/comments` (usa `req.user.id`). Sin edición/borrado en esta fase (YAGNI).
- **Actividad**: `GET /tasks/:id/activity` (o incluida en el detalle). Solo lectura; se genera automáticamente.

### Agente IA
`convertProposedTask` sigue creando tareas sin labels/checklist; añade una `TaskActivity` `CREATED` con `actorId: null` (origen IA). Sin cambios en las tools.

## Frontend / UX

### Componente central: panel de tarjeta (drawer)
Nuevo `components/tasks/TaskPanel.tsx` — drawer lateral derecho que se abre al hacer clic en cualquier tarjeta/fila. **Reutilizado** en `TasksPage`, `ProjectDetailPage` y el tablero. Contiene, en secciones:
- Cabecera: título editable inline, proyecto, botón cerrar.
- Etiquetas asignadas (chips de color) + selector para añadir/crear/quitar.
- Controles: estado, prioridad, responsable (`useAssignees`), fecha de inicio, vencimiento.
- Descripción.
- Checklist con barra de progreso (añadir/marcar/borrar/reordenar ítems).
- Feed "Actividad y comentarios": caja para escribir comentario + lista cronológica de comentarios y eventos de actividad intercalados.

El estado de "qué tarjeta está abierta" se maneja por **query param `?tarea=<id>`** (enlazable y compartible; el panel lee/escribe el param con el router). Esto funciona igual en la página de Tareas y en el detalle del proyecto.

### Tarjeta enriquecida (`TaskCard`)
Añade: fila de chips de etiquetas (color), progreso de checklist (`✔ 2/5`), iniciales/avatar del responsable, además de lo actual (prioridad, vencimiento).

### Búsqueda de tareas
Input de texto en `TasksPage` (y en la vista de tareas del proyecto) que setea el filtro `search`, debounced, sobre la query de tareas.

### Integración proyecto ↔ tareas
`ProjectDetailPage` reemplaza la lista pobre por las **mismas vistas que la página global** (lista rica + Kanban), acotadas a ese proyecto vía `projectId`, con búsqueda y el mismo `TaskPanel`. Se extraen los componentes de vista de tareas (tabla rica y `TaskBoard`) para reutilizarlos con un `projectId` fijo, evitando duplicar lógica.

### Hooks y tipos
- `hooks/useLabels.ts` (`useLabels(orgId)`, `useSaveLabel`, `useDeleteLabel`).
- `hooks/useTasks.ts`: `TaskFilters` gana `search`; nuevas mutaciones para checklist y comentarios; `useTaskDetail(id)` para el panel.
- `types/core.ts`: `Task` gana `startDate`, `labels`, `checklistStats`; nuevos tipos `Label`, `ChecklistItem`, `TaskComment`, `TaskActivity`, `TaskDetail`.
- Constante de paleta de colores en `lib/labels.ts` (clave → clases Tailwind).

## Entrega por fases (plan dividido)

Un solo spec; el plan se implementa en fases, cada una mergeable y usable:

- **Fase 1 — Panel + etiquetas + fecha de inicio + búsqueda + integración en proyecto.** Modelo: `Task.startDate`, `Label`, `TaskLabel`. Panel de tarjeta (con las secciones que ya existen: controles, descripción, etiquetas). Búsqueda. `ProjectDetailPage` con lista+tablero reutilizados. Es el grueso visible.
- **Fase 2 — Checklist/subtareas.** Modelo `ChecklistItem` + endpoints; sección de checklist en el panel; progreso en la tarjeta.
- **Fase 3 — Actividad + comentarios.** Modelo `TaskActivity`, `TaskComment`, enum, paso de `req.user.id` a los services, `recordActivity`; feed en el panel.

Cada fase: rama propia, migración propia, tests, merge a `develop` verificado.

## Verificación

- **Backend**: `npm run build` (typecheck) + `npm test` (Vitest, BD real). Tests nuevos por fase: labels service (CRUD + unicidad por empresa + validación de color), sincronización de `labelIds` en task create/update, filtro `search`, checklist (crear/toggle/reordenar/borrar), comentarios (autoría), y `recordActivity` (emite los eventos correctos al comparar estados). Adaptar los tests existentes de tasks al nuevo `getById` enriquecido.
- **Frontend**: `npm run lint` + `vite build`. Smoke manual por fase: abrir panel desde tareas y desde el proyecto, crear/asignar etiquetas, buscar, checklist con progreso, escribir comentario y ver actividad, y el detalle de proyecto con lista+tablero.
- Verificar cada migración contra la BD de test (`npm run test:db:setup`).
- **`test/db.ts` (`resetDb`)**: el `TRUNCATE ... CASCADE` desde `organizations` y `users` **ya cubre** las nuevas tablas (`labels`, `task_labels`, `checklist_items`, `task_comments`, `task_activity`) por sus FKs, así que no hace falta cambio funcional; sí conviene actualizar el **comentario** de `resetDb` que enumera las tablas hijas para que no quede desactualizado.
