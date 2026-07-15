# Visibilidad de proyectos por usuario

**Fecha:** 2026-07-15
**Estado:** Diseño aprobado

## Problema

Hoy cualquier usuario autenticado ve **todos** los proyectos y tareas: ni `projects.service.list()` ni `tasks.service.list()` filtran por el usuario de la sesión. Hay proyectos (y sus tareas) que no todos los usuarios deben ver. Se necesita poder elegir, por proyecto, qué usuarios pueden verlo.

## Decisiones de producto

| Decisión | Valor |
|---|---|
| Exentos de la restricción | CEO y ADMIN ven siempre todos los proyectos |
| Comportamiento por defecto | Proyecto sin lista de miembros = visible para todos (los proyectos existentes no cambian) |
| Tarea asignada en proyecto restringido | Da visibilidad implícita del proyecto completo |
| Responsable (`ownerId`) de proyecto restringido | Da visibilidad implícita del proyecto |
| Quién edita la lista de visibilidad | Solo CEO/ADMIN (los COLABORADOR pueden crear/editar proyectos, pero no su visibilidad) |
| Tareas sin proyecto | Visibles para todos (no hay nada que las restrinja) |

## Regla de visibilidad (fuente única de verdad)

Un usuario puede ver un proyecto si se cumple **cualquiera** de:

1. Su rol es CEO o ADMIN
2. El proyecto no tiene miembros (`members` vacío = público)
3. Está en la lista de miembros (`ProjectMember`)
4. Tiene alguna tarea asignada en el proyecto (`TaskAssignee`)
5. Es el responsable del proyecto (`Project.ownerId`)

Una tarea es visible si su proyecto es visible (o si no tiene proyecto).

## Modelo de datos

Nueva tabla puente en `backend/prisma/schema.prisma`, calcada de `TaskAssignee`:

```prisma
model ProjectMember {
  projectId String
  userId    String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([projectId, userId])
  @@index([userId])
  @@map("project_members")
}
```

Back-relations: `Project.members ProjectMember[]` y `User.projectMemberships ProjectMember[]`.

**Migración:** solo crea la tabla, sin datos. Todos los proyectos existentes quedan con lista vacía → públicos, comportamiento idéntico al actual.

## Backend

### Propagación del usuario

Los controllers de `modules/projects/` y `modules/tasks/` pasarán `req.user` completo (id + rol, tipo `AuthUser` de `middleware/auth.ts`) a los services. Nota: los controllers de tareas ya pasan `req.user?.id` como `actorId` para la actividad; ahora se necesita también el rol para decidir el filtrado. Para CEO/ADMIN no se añade ningún filtro (cero impacto en lo existente).

### Helper compartido

En `modules/shared/` (junto a `roles.ts`), una función `projectVisibilityWhere(user)` que devuelve el fragmento de `where` de Prisma para COLABORADOR:

```ts
OR: [
  { members: { none: {} } },                                // público
  { members: { some: { userId } } },                        // en la lista
  { tasks: { some: { assignees: { some: { userId } } } } }, // tarea asignada
  { ownerId: userId },                                      // responsable
]
```

**Composición con `AND`:** tanto `projects.service.list()` como (sobre todo) `tasks.service.list()` pueden tener ya un `OR` propio en el `where` (la búsqueda por texto en tareas usa `where.OR`). La condición de visibilidad se añade siempre dentro de `where.AND = [...]` para no pisar ni ser pisada por otros `OR`.

### Puntos de aplicación

| Punto | Cambio |
|---|---|
| `projects.service.list()` | añade la condición de visibilidad dentro de `where.AND` si es colaborador |
| `projects.service.getById()` | proyecto no visible para colaborador → `notFound` (404, no 403: no revelar que existe) |
| `projects.service.update()` / `remove()` | misma comprobación que `getById` |
| `tasks.service.list()` | para colaborador, dentro de `where.AND`: `OR: [{ projectId: null }, { project: <regla> }]` |
| `tasks.service.getById()` / `update()` / `remove()` y subrecursos (checklist, comentarios) | tarea de proyecto no visible → `notFound` |
| `tasks.service.create()` / `update()` con `projectId` de entrada | si el colaborador no puede ver ese proyecto → `notFound` (mismo 404 que `getById`, no revelar que existe). Sin esto, un colaborador podría sondear IDs de proyectos ocultos o **ganarse visibilidad implícita autoasignándose una tarea** (regla 4). La UI ya no ofrece esos proyectos en el selector; esta validación lo impone en el servidor. |
| `organizations.service.getById()` / `business-units.service.getById()` | filtran los `projects` embebidos con la misma regla (hallazgo de revisión: estas rutas son legibles por COLABORADOR — `allowRoles read: ALL_ROLES` — y embebían la lista completa de proyectos, esquivando todo el filtrado). Los `_count` agregados NO se filtran: revelan solo cantidades, no nombres — aceptado para una herramienta interna. |

### Escritura de miembros

- `createProjectSchema` / `updateProjectSchema` (`projects.schema.ts`) aceptan `memberIds: string[]` opcional.
- El service los gestiona como `assigneeIds` en `tasks.service.ts` (reemplazo del set completo: `deleteMany` + `createMany`).
- Solo se procesa si `req.user` es CEO/ADMIN; si un colaborador manda `memberIds`, se **ignora silenciosamente** (el campo no existe en su UI).
- `memberIds` con un userId inexistente → 400 (`badRequest`), reutilizando `assertAssignableUsers` de `modules/shared/relations.ts` (la misma validación que usan los assignees de tareas). Como esa validación solo comprueba existencia, se aceptan usuarios inactivos en la lista — intencional y coherente con el caso borde de desactivación.

### Respuestas

`list` y `getById` de proyectos incluyen `members` (`{ user: { id, name } }[]`, la misma forma que `assignees` en tareas) para que la UI muestre quién tiene acceso. El `getById` sigue incluyendo las `tasks` embebidas del proyecto: es intencional y coherente con la regla "proyecto visible ⇒ tareas visibles".

### Fuera de alcance

Dashboard, agente IA (`agent/tools.ts`) y finanzas/ventas/documentos/decisiones no se tocan: son módulos solo-admin (`routes/index.ts`) y los admins ven todo. Si en el futuro se abren a colaboradores, deberán aplicar el mismo helper.

## Frontend

- **`ProjectForm.tsx`**: para CEO/ADMIN (gating con `isAdmin()` de `lib/permissions.ts`), campo nuevo "Visibilidad" reutilizando `components/tasks/AssigneePicker.tsx` con `useAssignees()`. Sin selección → texto de ayuda "Visible para todos los usuarios". Para COLABORADOR el campo no se renderiza.
- **Listado y detalle**: indicador de candado en proyectos restringidos (con los nombres de los miembros en el detalle). Los colaboradores no necesitan cambios de UI: el filtrado viene del backend.
- **Tipos y hooks**: `types/domain.ts` → `Project.members: { id: string; name: string }[]`; `useSaveProject()` manda `memberIds` e invalida también `tasks` (un colaborador puede ganar/perder tareas visibles al cambiar la lista).
- **Efecto dominó gratis**: al filtrar server-side `GET /projects` y `GET /tasks`, los selectores de proyecto (`ContextFields.tsx`, `TaskForm.tsx`) quedan filtrados sin tocarlos.
- **UX de pérdida de acceso**: si un admin restringe un proyecto que un colaborador tiene abierto, la siguiente petición devuelve 404 y se muestra el estado "no encontrado" existente.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Usuario desactivado en la lista | Permanece en la lista; sin sesión no accede; al reactivarlo recupera acceso. Sin limpieza automática. |
| Colaborador crea un proyecto | Nace público (sin lista). Si luego un admin lo restringe sin incluirlo, deja de verlo (política elegida). |
| Quitar de la lista a alguien con tareas asignadas | Sigue viendo el proyecto por visibilidad implícita; para excluirlo hay que reasignar sus tareas. El picker lo indica con una nota. |
| `/assignees` | Sigue devolviendo todos los usuarios activos (los nombres no son confidenciales; los pickers los necesitan). |

## Verificación

- **Tests backend** (Vitest + BD de test, infraestructura ya montada): suite nueva de visibilidad —
  - colaborador ve públicos + donde es miembro / owner / asignado;
  - no ve restringidos ajenos (`list` los excluye, `getById` → 404);
  - admin ve todo;
  - `memberIds` ignorado si lo manda un colaborador;
  - tareas de proyecto oculto excluidas de `GET /tasks` y su `getById` → 404;
  - colaborador no puede crear/mover una tarea hacia un proyecto no visible (→ 404), y un colaborador miembro/owner sí puede (camino feliz);
  - la búsqueda por texto en tareas sigue funcionando combinada con el filtro de visibilidad (composición `AND`/`OR`).
- **Typecheck**: `npm run build` (backend) y `npm run lint` (frontend).
- **Prueba manual**: login como colaborador, verificar listado filtrado y 404 en detalle restringido.
