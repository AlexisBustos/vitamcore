# Responsable de tareas y proyectos por usuario — Diseño

**Fecha:** 2026-07-02
**Estado:** Aprobado (brainstorming), pendiente de plan de implementación

## Problema

Hoy el responsable de una `Task` y de un `Project` es un campo de **texto libre** (`owner String?`), que se escribe a mano en un input en `TaskForm`/`ProjectForm`. Esto tiene dos problemas:

1. **Datos sucios y no consultables**: "Juan", "Juan P.", "juanp" son la misma persona pero tres valores distintos. No se puede filtrar de forma confiable ni saber la carga real de cada persona.
2. **Desaprovecha el RBAC recién agregado**: ya existe la tabla `User` con las personas reales del sistema (CEO, admins, colaboradores), pero tareas y proyectos no se relacionan con ellas.

## Objetivo

Que el responsable de cada tarea (y proyecto) se **elija de un desplegable** con las personas registradas en el sistema, reemplazando el texto libre por una relación real a `User`. Esto habilita, casi gratis, un filtro **"mis tareas"** y deja el modelo listo para reportes de carga por persona más adelante.

## Decisiones tomadas (brainstorming)

| # | Decisión | Resolución |
|---|----------|-----------|
| 1 | ¿Responsable registrado o texto libre? | **Solo usuarios registrados** (FK `ownerId → User`). |
| 2 | ¿Aplica a tareas o también a proyectos? | **Ambos** (`Task` y `Project`, mismo patrón). |
| 3 | ¿Un responsable o varios? | **Uno** (relación 1-a-muchos, `ownerId` único por registro). |
| 4 | ¿Qué pasa con los `owner` de texto actuales? | **Migración best-effort**: match por nombre normalizado; los no matcheados se preservan en `notes` como "Responsable previo (sin cuenta): …" y quedan sin asignar. |
| 5 | ¿Filtro "mis tareas"? | **Sí**, filtro básico por `ownerId` (sin notificaciones). |
| 6 | ¿Cómo obtiene la lista de personas un COLABORADOR? | **Nuevo endpoint `GET /api/assignees`** de solo lectura, accesible a todos los roles, sin exponer el módulo admin `/users`. |

## Modelo de datos

En `backend/prisma/schema.prisma`, tanto `Task` como `Project`:

- **Reemplazar** `owner String?` por `ownerId String?`.
- Añadir la relación a `User`:
  ```prisma
  owner   User? @relation("TaskOwner",    fields: [ownerId], references: [id], onDelete: SetNull)
  // y análogamente "ProjectOwner" en Project
  ```
- `onDelete: SetNull`: si se elimina (o desactiva y se decide borrar) un usuario, las tareas/proyectos quedan sin responsable, no se borran.
- Añadir `@@index([ownerId])` en ambos modelos.

En `User`, añadir las back-relations:
```prisma
ownedTasks    Task[]    @relation("TaskOwner")
ownedProjects Project[] @relation("ProjectOwner")
```

`ownerId` es **nullable**: una tarea o proyecto puede no tener responsable.

### Migración de datos (sin pérdida silenciosa)

Una única migración Prisma que:

1. Añade la columna `ownerId` (nullable) manteniendo `owner` temporalmente.
2. Ejecuta un paso de datos: por cada fila con `owner` no vacío, busca un `User` cuyo `name` coincida tras normalizar (`trim` + minúsculas). Si hay match único → set `ownerId`.
3. Para las filas cuyo `owner` **no** matchea ningún usuario: antepone el nombre viejo a `notes` con el prefijo `Responsable previo (sin cuenta): <nombre>` (respetando el `notes` existente si lo hubiera), y deja `ownerId = NULL`.
4. Elimina la columna `owner`.

El paso de datos se implementa como SQL dentro del archivo de migración (o un script `tsx` invocado en el flujo de migración del sprint), no en runtime de la app.

## Backend

### Nuevo módulo `assignees` (solo lectura)

Módulo mínimo siguiendo la convención de 4 archivos (aquí `schema` es trivial o se omite por no tener input):

- `GET /api/assignees` → devuelve `{ data: Array<{ id, name, role }> }`, **solo usuarios con `isActive = true`**, ordenados por `name`.
- Reutiliza la lógica de `users.service` (un `select` acotado sin `passwordHash`) o expone una función `listAssignables()` propia.
- Montado en `routes/index.ts` con `allowRoles({ read: ALL_ROLES })` (o `requireRole(...ALL_ROLES)` al ser solo GET) — **no** hereda el `adminOnly` del módulo `/users`.

Este endpoint es el que permite que un COLABORADOR pueble el desplegable sin acceder al módulo admin de usuarios.

### Validación de coherencia

Nuevo helper en `backend/src/modules/shared/relations.ts`:

- `assertAssignableUser(ownerId)` — si `ownerId` viene, verifica que exista un `User` con ese id y `isActive = true`; si no, lanza `badRequest`. Coherente con el patrón existente (`assertOrganization`, `assertBusinessUnitInOrganization`).

### Tareas (`modules/tasks/`)

- `tasks.schema.ts`: reemplazar `owner: z.string()...` por `ownerId: z.string().min(1).optional().nullable()` en `createTaskSchema`; `updateTaskSchema` lo hereda vía `.partial()`. Añadir `ownerId` opcional a `listTasksQuery`.
- `tasks.service.ts`:
  - En `create` y `update`, llamar `assertAssignableUser(input.ownerId)` junto al resto de `assertRelations`.
  - En `list`, propagar el filtro `ownerId` al `where`.
  - En los `include` de `list` y `getById`, añadir `owner: { select: { id: true, name: true } }`.

### Proyectos (`modules/projects/`)

Cambios simétricos a tareas: `projects.schema.ts` (`owner` → `ownerId`, filtro `ownerId` en el list query), `projects.service.ts` (`assertAssignableUser`, `include` de `owner`, filtro).

### Agente

- `agent.service.ts` `convertProposedTask`: cambiar `owner: null` por `ownerId: null` en la llamada a `createTask`. Los `AgentProposedTask` no llevan responsable; se asigna al convertir o después.

## Frontend

- **Hook** `hooks/useAssignees.ts`: `useAssignees()` → `GET /assignees`, `queryKey: ['assignees']`. Solo query (no hay mutaciones).
- **Tipos** `types/core.ts`: en `Project` y `Task`, cambiar `owner: string | null` por:
  ```ts
  ownerId: string | null;
  owner: { id: string; name: string } | null; // objeto incluido por el backend
  ```
- **`TaskForm` y `ProjectForm`**: reemplazar el `<input>` de "Responsable" por un `<Select>` (componente `components/ui/`) poblado con `useAssignees()`, con una opción "Sin asignar" (`ownerId = null`). El form envía `ownerId`.
- **Vistas de lectura** (`ProjectDetailPage`, `ProjectsPage`, listas y detalle de tareas): mostrar `owner?.name ?? '—'`. En `ProjectsPage`, ajustar el filtro de búsqueda de texto que hoy usa `p.owner` para usar `p.owner?.name`.
- **Filtro "Mis tareas"** en la página de tareas: un toggle que setea el filtro `ownerId` al id del usuario logueado (obtenido del contexto de auth existente). Se traduce en `?ownerId=<id>` sobre la query de tareas.

## Fuera de alcance (YAGNI)

- Notificaciones al asignar un responsable.
- Múltiples responsables por tarea.
- Asignar a personas externas sin cuenta.
- Reportes/dashboards de carga por persona (el modelo queda listo, pero no se construyen ahora).

## Verificación

No hay framework de tests de frontend; la verificación es el typecheck. Para el backend hay Vitest contra BD real.

- **Backend**: `npm run build` (typecheck) + `npm test` (los tests de caracterización de `tasks`/`projects` deben adaptarse al cambio `owner` → `ownerId`; añadir cobertura para `assertAssignableUser` y para el endpoint `/assignees`). Verificar la migración de datos contra la BD de test.
- **Frontend**: `npm run lint` (typecheck) + `vite build`. Smoke manual: crear/editar tarea y proyecto eligiendo responsable del desplegable, filtro "mis tareas", y verificar que un COLABORADOR ve el desplegable poblado y no puede acceder a `/users`.
- **Migración**: verificar en una copia con datos que los nombres que matchean quedan asignados y los que no, con el prefijo en `notes` y `ownerId` nulo.
