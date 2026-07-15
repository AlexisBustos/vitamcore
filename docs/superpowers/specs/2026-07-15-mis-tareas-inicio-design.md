# Mis tareas al iniciar sesión

**Fecha:** 2026-07-15
**Estado:** Diseño aprobado

## Problema

Al entrar al sistema, un usuario no ve de inmediato las tareas asignadas a él. El dashboard (solo CEO/ADMIN) no lista "mis tareas", y un COLABORADOR aterriza en `/proyectos`, no en sus tareas. Se quiere que cada usuario, al iniciar sesión, vea sus tareas pendientes.

## Decisiones de producto

| Decisión | Valor |
|---|---|
| Alcance | Todos los usuarios (CEO, ADMIN, COLABORADOR) |
| Qué son "mis tareas" | Tareas donde soy responsable (assignee), **sin terminar** (estado ≠ `DONE`), ordenadas por fecha de vencimiento |
| CEO/ADMIN | Tarjeta "Mis tareas" en el dashboard (su pantalla de inicio) |
| COLABORADOR | Aterriza en `/tareas` con el filtro "Mis tareas" activo (su pantalla de inicio pasa a ser sus tareas) |
| Backend | Sin cambios: se reutiliza `GET /tasks?assigneeId=<yo>` (accesible por todos los roles, ya devuelve empresa/proyecto/vencimiento/estado/prioridad) |

## Enfoque

Opción A (reutilizar lo existente). Dos superficies, ningún cambio de backend ni de base de datos. El endpoint `/tasks` ya soporta el filtro `assigneeId` y es accesible por todos los roles (`ALL_ROLES` en `routes/index.ts`), y `tasks.service.list` ya incluye `organization`, `project`, `priority`, `status`, `dueDate` y `assignees`.

## Superficie 1 — Tarjeta "Mis tareas" en el dashboard (CEO/ADMIN)

- **Ubicación**: `frontend/src/pages/DashboardPage.tsx`, junto a la tarjeta "Próximos vencimientos" (mismo grid/columna), reutilizando `Card`/`CardHeader`/`CardTitle`/`CardContent` y el patrón de lista con divisores.
- **Datos**: `DashboardPage` añade `useAuth()` (hoy no lo importa) y un `useTasks({ assigneeId: user?.id })` (hook existente `frontend/src/hooks/useTasks.ts`), con `enabled: !!user?.id` por robustez (sin id, `useTasks({})` traería TODAS las tareas). Es una query de React Query independiente del resumen del dashboard (`/dashboard/summary` no se toca). Nota: `useTasks` puede necesitar exponer la opción `enabled`; si su firma actual no lo permite, envolver la condición en el propio hook o pasar `assigneeId` solo cuando exista.
- **Filtrado y orden (en el cliente)**: quedarse con `status !== 'DONE'`, ordenar por `dueDate` ascendente (las tareas sin fecha al final), y mostrar las primeras ~8. Filtrar en el cliente es trivial (un solo usuario, pocas tareas) y evita tocar el backend.
- **Cada fila**: título + `empresa · proyecto` (como en "Próximos vencimientos"), con `PriorityBadge` y la fecha de vencimiento (`formatDate`, ya usado en el dashboard). La fecha se muestra en rojo si está vencida — comportamiento **nuevo** en esta tarjeta (la de "Próximos vencimientos" usa gris): importar `isOverdue` de `lib/domain.ts` y aplicar el color `text-[var(--color-danger)]` cuando corresponda, como hacen `TasksTableView`/`ProjectsPage`. Al hacer clic, navega a `/tareas?tarea=<id>` (la página de tareas ya abre el panel de la tarea vía el query param `tarea`).
- **Pie**: enlace "Ver todas" → `/tareas` (donde el filtro se puede activar). 
- **Estado vacío**: `EmptyState` "No tienes tareas pendientes".
- **Gating**: la tarjeta vive en el dashboard, que ya es solo-admin (`RequireAdmin`); no requiere gating adicional.

## Superficie 2 — Aterrizaje del COLABORADOR en `/tareas`

Dos ajustes de frontend, sin backend:

1. **Ruta de aterrizaje** (`frontend/src/lib/permissions.ts`): `landingPath()` para no-admin pasa de `/proyectos` a `/tareas`. El CEO/ADMIN sigue aterrizando en el dashboard (`/`). Mecanismo: `LoginPage` navega siempre a `/` (no usa `landingPath`); desde ahí, `RequireAdmin` detecta al no-admin y lo reenvía con `Navigate to={landingPath(role)}`. Es decir, el único punto que consume `landingPath` es `RequireAdmin` — no hay que tocar `LoginPage`. El colaborador llega a `/tareas` de forma transitiva (`login → / → /tareas`).
2. **Filtro por defecto** (`frontend/src/pages/tasks/TasksPage.tsx`): el estado inicial de `filters` arranca con `assigneeId = user.id` **solo si el usuario NO es admin** (`!isAdmin(user?.role)`, helper de `lib/permissions.ts`). El admin sigue entrando a `/tareas` sin filtro, como hoy. Implementación: llamar `useAuth()` antes de la declaración de `filters` y usar un inicializador perezoso: `useState<TaskFilters>(() => (!isAdmin(user?.role) ? { assigneeId: user?.id } : {}))`. Como `/tareas` está bajo `ProtectedRoute`, `user` ya está cargado en el primer render.

El botón "Mis tareas" existente queda resaltado (activo) porque su estado depende de `filters.assigneeId`; el colaborador puede desactivarlo para ver el resto de tareas visibles para él.

## Fuera de alcance / notas

- La página `/tareas` es la vista completa (buscador, tabla/tablero): el colaborador ve **todas** sus tareas asignadas ahí, incluidas las terminadas en la columna "Hecho" del tablero. La restricción a "sin terminar" aplica solo a la tarjeta compacta del dashboard. Mostrar todos los estados en la página completa es coherente con el comportamiento actual del botón "Mis tareas".
- No cambia la visibilidad: el colaborador ya solo ve tareas de proyectos que puede ver (feature de visibilidad de proyectos).
- El menú lateral del colaborador no cambia (Proyectos y Tareas siguen disponibles).
- No hay cambios de backend, schema ni migraciones.

## Verificación

- **Typecheck**: `npm run lint` (frontend) y `npm run build` (frontend).
- **Prueba manual**:
  - CEO/admin: iniciar sesión → dashboard muestra la tarjeta "Mis tareas" con las tareas asignadas y sin terminar; "Ver todas" lleva a `/tareas`; clic en una fila abre su panel.
  - COLABORADOR: iniciar sesión → aterriza en `/tareas` con "Mis tareas" activo mostrando solo sus tareas; puede desactivar el filtro.
