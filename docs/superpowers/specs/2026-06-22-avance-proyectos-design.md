# Avance y cumplimiento automático de proyectos

**Fecha:** 2026-06-22
**Estado:** Diseño aprobado (pendiente de plan de implementación)
**Ámbito:** backend (`modules/projects`, `modules/tasks`)

## Contexto y problema

Hoy un proyecto (`Project`) tiene un campo `status` (enum `ProjectStatus`) que se
edita **solo a mano**, y el avance se muestra como un porcentaje de tareas
completadas (`taskStats: { total, done }` en el listado, barra de avance en la
lista y el detalle). El estado del proyecto y el avance real de sus tareas viven
desconectados: se puede tener el 100% de las tareas hechas con el proyecto aún en
`IDEA`.

El objetivo es que **el estado del proyecto refleje automáticamente el avance de
sus tareas**, sin que el CEO tenga que mantenerlo a mano, pero **sin pisar las
decisiones manuales** (bloquear, pausar, cancelar, poner en revisión).

## Decisiones tomadas (brainstorming)

1. **El avance se mide por tareas, automático.** No hay avance manual ni hitos.
2. **Todas las tareas pesan igual.** Sin ponderación por prioridad ni esfuerzo.
3. **Solo `DONE` cuenta.** Una tarea en `DOING` no aporta avance parcial.
   El cálculo del porcentaje no cambia respecto al actual: `done / total`.
4. **El estado del proyecto se mueve automáticamente** según las tareas
   (camino feliz `IDEA`/`PLANNED` → `IN_PROGRESS` → `COMPLETED`).
5. **Los estados manuales se respetan.** Si el proyecto está en `BLOCKED`,
   `PAUSED`, `CANCELLED` o `IN_REVIEW`, la automatización no lo toca.
6. **`COMPLETED` es reversible.** Reabrir o agregar tareas devuelve el proyecto a
   `IN_PROGRESS`.

## Modelo de avance (sin cambios)

El porcentaje de avance ya está implementado y **no se modifica**:
- Backend: `projects.service.list` devuelve `taskStats: { total, done }` por
  proyecto vía `groupBy`.
- Frontend: barra de avance en `ProjectsPage` (columna "Avance") y en
  `ProjectDetailPage` (calculada desde `project.tasks`).

Este diseño añade únicamente la **transición automática de estado**.

## Reglas de transición automática

### Estado derivado de las tareas

Dada la lista de tareas de un proyecto, se calcula un **estado derivado**:

| Situación de las tareas                                   | Estado derivado    |
| --------------------------------------------------------- | ------------------ |
| Hay tareas (`total > 0`) y **todas** están `DONE`         | `COMPLETED`        |
| Hay actividad: ≥1 `DOING`, **o** ≥1 `DONE` pero no todas  | `IN_PROGRESS`      |
| Sin tareas (`total == 0`), **o** todas en `TODO`          | *sin opinión* (∅)  |

### Aplicación del estado derivado

`STATUS_AUTO` = estados del "camino feliz" donde la automatización puede actuar:
`{ IDEA, PLANNED, IN_PROGRESS, COMPLETED }`.

`STATUS_MANUAL` (protegidos, nunca tocados): `{ BLOCKED, PAUSED, CANCELLED, IN_REVIEW }`.

Regla:
1. Si el `status` actual del proyecto **no** está en `STATUS_AUTO` → no hacer nada.
2. Si el estado derivado es ∅ (sin opinión) → no hacer nada.
3. Si el estado derivado ≠ `status` actual → actualizar `status` al derivado.
4. En cualquier otro caso → no hacer nada (evita escrituras redundantes).

Consecuencias intencionales:
- Nunca se "des-empieza" un proyecto: un proyecto en `IN_PROGRESS` cuyas tareas
  vuelven todas a `TODO` queda en `IN_PROGRESS` (derivado ∅, regla 2).
- Un proyecto en `IDEA`/`PLANNED` con tareas sin empezar sigue igual.
- La distinción entre `IDEA` y `PLANNED` siempre es manual; la automatización solo
  sube a `IN_PROGRESS` o `COMPLETED`.

## Diseño técnico (backend)

### Nueva función: `syncProjectStatus`

Ubicación: `modules/projects/projects.service.ts` (export reutilizable).

```
export async function syncProjectStatus(projectId: string): Promise<void>
```

Comportamiento:
1. Carga el proyecto (`select: { id, status }`). Si no existe, retorna sin error
   (la tarea pudo dejar `projectId` nulo o el proyecto fue borrado).
2. Si `status ∉ STATUS_AUTO` → retorna (respeta estados manuales).
3. Calcula el estado derivado con un `groupBy` de tareas por `status`
   (`where: { projectId }`), reutilizando el mismo patrón de conteo que `list`.
4. Si el derivado es ∅ o igual al actual → retorna.
5. Si difiere → `prisma.project.update({ where: { id }, data: { status } })`.

No lanza errores de negocio: es un efecto secundario best-effort que no debe
romper la mutación de la tarea que lo disparó.

### Integración en `tasks.service.ts`

La sincronización se dispara **después** de cada mutación que afecte la relación
tarea↔proyecto o el estado de la tarea:

- **`create`**: tras crear, si la tarea tiene `projectId` → `syncProjectStatus(projectId)`.
- **`update`**: necesita el `projectId` **anterior** y el **nuevo**.
  - Ampliar el `select` de `current` para incluir `projectId` (hoy solo trae
    `id, organizationId`).
  - Tras actualizar, sincronizar el conjunto de proyectos afectados:
    `new Set([prevProjectId, nextProjectId])` filtrando nulos. Esto cubre el caso
    de **mover una tarea de un proyecto a otro** (ambos se recalculan) y el cambio
    de `status` dentro del mismo proyecto.
- **`remove`**: ampliar el `select` para traer `projectId` antes de borrar; tras
  borrar, si había `projectId` → `syncProjectStatus(projectId)`.

### Consistencia transaccional

Cada mutación de tarea y su `syncProjectStatus` se ejecutan dentro de una
`prisma.$transaction` para que la actualización de la tarea y el recálculo del
estado del proyecto sean atómicos. `syncProjectStatus` acepta opcionalmente el
cliente transaccional:

```
export async function syncProjectStatus(
  projectId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void>
```

Los `groupBy`/`update`/`findUnique` internos usan `client` en lugar de `prisma`.

> Nota de implementación: el `groupBy` debe ejecutarse con el mismo `client` para
> ver el estado de la tarea recién escrito dentro de la transacción.

### Importaciones

`tasks.service.ts` importa `syncProjectStatus` desde `../projects/projects.service`.
No se crea dependencia circular nueva (projects no importa tasks).

## Frontend

**Sin cambios.** `useTasks` ya invalida `['projects']` y `['dashboard']` en
`invalidateTaskGraph` (cubre `useSaveTask`, `useMoveTask` y `useDeleteTask`), por
lo que el badge de estado del proyecto y la barra de avance se refrescan solos tras
cualquier movimiento de tarea, incluido el Kanban con actualización optimista.

## Casos borde

| Caso | Resultado |
| --- | --- |
| Borrar **todas** las tareas de un proyecto `COMPLETED` | Derivado ∅ → queda `COMPLETED` (cierre formal; sin tareas no se revierte). |
| Mover una tarea entre dos proyectos | Se recalculan ambos proyectos. |
| Tarea sin `projectId` (suelta) | No dispara ninguna sincronización. |
| Proyecto en `BLOCKED` y se completan todas sus tareas | No cambia (estado protegido). El CEO decide cuándo sacarlo de `BLOCKED`. |
| Reabrir 1 tarea (`DONE`→`DOING`) en proyecto `COMPLETED` | Derivado `IN_PROGRESS` → vuelve a `IN_PROGRESS`. |
| Proyecto en estado manual con todas las tareas `DONE`, que luego mueves a mano a un estado del camino feliz | La sincronización **solo se dispara por mutaciones de tarea**, no al editar el proyecto. Quedará en el estado que pusiste hasta la próxima mutación de una de sus tareas (decisión consciente: editar el proyecto no es un disparador). |

## Fuera de alcance (YAGNI)

- Ponderación de tareas por prioridad/esfuerzo.
- Avance parcial por estado `DOING`.
- Hitos/fases de proyecto.
- Avance manual o override del porcentaje.
- Historial/auditoría de cambios automáticos de estado.
- Notificaciones o sugerencias ("¿marcar como completado?").

## Verificación

Sin framework de tests; la verificación es el typecheck más prueba manual:
- `cd backend && npm run build` (typecheck del backend).
- Prueba manual sobre la BD local:
  1. Crear proyecto en `IDEA`, agregar 2 tareas → sigue `IDEA`.
  2. Mover 1 tarea a `DOING` → proyecto pasa a `IN_PROGRESS`.
  3. Mover ambas a `DONE` → proyecto pasa a `COMPLETED`.
  4. Reabrir 1 tarea → proyecto vuelve a `IN_PROGRESS`.
  5. Poner el proyecto en `PAUSED` a mano y mover tareas → no cambia.
  6. Mover una tarea a otro proyecto → ambos proyectos recalculan su estado.
