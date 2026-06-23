# Sincronización automática del estado de proyectos — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el estado de un proyecto (`Project.status`) se sincronice automáticamente según el avance de sus tareas, sin pisar los estados que el CEO pone a mano.

**Architecture:** Una función pura-de-efecto `syncProjectStatus(projectId, client?)` en `projects.service.ts` calcula el estado derivado de las tareas y lo aplica solo si el proyecto está en un estado del "camino feliz". Las tres mutaciones de tarea (`create`, `update`, `remove`) en `tasks.service.ts` se envuelven en `prisma.$transaction` y llaman a `syncProjectStatus` con el cliente transaccional tras escribir.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL). Sin framework de tests: la verificación es el typecheck (`npm run build`) más un guion de prueba manual contra la BD local en Docker.

**Spec de referencia:** `docs/superpowers/specs/2026-06-22-avance-proyectos-design.md`

---

## Nota sobre verificación (leer antes de empezar)

Este repo **no tiene Jest/Vitest/Mocha**. CLAUDE.md es explícito: "La verificación es
el typecheck (`npm run build` en backend)". **No instales un framework de tests ni
escribas tests unitarios** — sería romper la convención del proyecto. Cada tarea se
verifica con:
1. `cd backend && npm run build` (typecheck completo, debe pasar sin errores).
2. Al final, el guion de prueba manual de la Tarea 3.

La BD debe estar arriba: desde la raíz, `docker compose up -d`.

---

## Estructura de archivos

- **Modificar** `backend/src/modules/projects/projects.service.ts`
  - Añadir constante `STATUS_AUTO` y la función exportada `syncProjectStatus`, más el helper privado `deriveStatus`.
  - Responsabilidad: toda la lógica de transición de estado del proyecto vive aquí, junto al resto de la lógica de negocio de proyectos.
- **Modificar** `backend/src/modules/tasks/tasks.service.ts`
  - Importar `syncProjectStatus`; envolver `create`/`update`/`remove` en `$transaction` y disparar la sincronización.
  - Ampliar el `select` de `update` y `remove` para traer `projectId`.

No se crea dependencia circular: `projects.service` no importa nada de `tasks`.

---

## Chunk 1: Implementación completa

### Task 1: Función `syncProjectStatus` en projects.service

**Files:**
- Modify: `backend/src/modules/projects/projects.service.ts`

- [ ] **Step 1: Ampliar el import de Prisma con los tipos de enum**

En la cabecera del archivo, el import actual es:

```ts
import { Prisma } from '@prisma/client';
```

Cámbialo a (añade los tipos de enum como `type`):

```ts
import { Prisma } from '@prisma/client';
import type { ProjectStatus, TaskStatus } from '@prisma/client';
```

- [ ] **Step 2: Añadir la constante de estados automáticos**

Justo después de los imports y antes de `export async function list`, añade:

```ts
// Estados del "camino feliz" que la automatización puede gestionar.
// Los demás (BLOCKED, PAUSED, CANCELLED, IN_REVIEW) son decisiones manuales
// y nunca se tocan automáticamente.
const STATUS_AUTO: ProjectStatus[] = [
  'IDEA',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
];
```

- [ ] **Step 3: Añadir el helper `deriveStatus` y la función `syncProjectStatus`**

Al final del archivo (después de `handleUniqueError`), añade:

```ts
/**
 * Calcula el estado que "merece" un proyecto según el recuento de sus tareas
 * por estado. Devuelve `null` cuando no hay opinión (sin tareas o todas por
 * hacer): en ese caso la automatización no debe tocar el proyecto.
 */
function deriveStatus(
  grouped: { status: TaskStatus; _count: { _all: number } }[],
): ProjectStatus | null {
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  if (total === 0) return null; // sin tareas → sin opinión

  const done = grouped.find((g) => g.status === 'DONE')?._count._all ?? 0;
  if (done === total) return 'COMPLETED'; // todas hechas

  const todo = grouped.find((g) => g.status === 'TODO')?._count._all ?? 0;
  if (todo === total) return null; // todas por hacer → sin opinión

  return 'IN_PROGRESS'; // hay actividad (algún DOING, o DONE parcial)
}

/**
 * Sincroniza el estado del proyecto con el avance de sus tareas.
 * - Respeta los estados manuales: si el proyecto no está en STATUS_AUTO, no hace nada.
 * - Solo escribe si el estado derivado difiere del actual.
 * Es un efecto secundario best-effort: si el proyecto no existe, retorna en silencio.
 *
 * Acepta un cliente transaccional para ejecutarse dentro de la misma transacción
 * que la mutación de tarea que lo dispara (así el groupBy ve la escritura reciente).
 */
export async function syncProjectStatus(
  projectId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  const project = await client.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
  });
  if (!project) return;
  if (!STATUS_AUTO.includes(project.status)) return;

  const grouped = await client.task.groupBy({
    by: ['status'],
    where: { projectId },
    _count: { _all: true },
  });

  const derived = deriveStatus(grouped);
  if (!derived || derived === project.status) return;

  await client.project.update({
    where: { id: projectId },
    data: { status: derived },
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npm run build`
Expected: PASS sin errores. (Aún no se usa `syncProjectStatus`, pero debe compilar; la firma con `Prisma.TransactionClient = prisma` por defecto debe tipar correctamente.)

Si TS se queja del tipo de `grouped` en `deriveStatus`, verifica que el `by: ['status']` y `_count: { _all: true }` coinciden con la forma del parámetro `{ status, _count: { _all } }`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/projects/projects.service.ts
git commit -m "feat(proyectos): syncProjectStatus deriva el estado del proyecto desde sus tareas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Disparar la sincronización desde las mutaciones de tarea

**Files:**
- Modify: `backend/src/modules/tasks/tasks.service.ts`

- [ ] **Step 1: Importar `syncProjectStatus`**

En la cabecera, junto a los demás imports, añade:

```ts
import { syncProjectStatus } from '../projects/projects.service';
```

- [ ] **Step 2: Envolver `create` en transacción y sincronizar**

Reemplaza la función `create` actual:

```ts
export async function create(input: CreateTaskInput) {
  await assertOrganization(input.organizationId);
  await assertRelations(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.task.create({ data: input });
}
```

por:

```ts
export async function create(input: CreateTaskInput) {
  await assertOrganization(input.organizationId);
  await assertRelations(input.organizationId, input.businessUnitId, input.projectId);
  // Las validaciones anteriores solo leen, así que pueden ir fuera de la
  // transacción. La escritura + la sincronización del proyecto van juntas.
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data: input });
    if (task.projectId) await syncProjectStatus(task.projectId, tx);
    return task;
  });
}
```

- [ ] **Step 3: Ampliar el `select` de `update` y sincronizar ambos proyectos**

Reemplaza la función `update` actual:

```ts
export async function update(id: string, input: UpdateTaskInput) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!current) throw notFound('Tarea no encontrada');

  await assertRelations(
    current.organizationId,
    input.businessUnitId,
    input.projectId,
  );

  return prisma.task.update({ where: { id }, data: input });
}
```

por:

```ts
export async function update(id: string, input: UpdateTaskInput) {
  const current = await prisma.task.findUnique({
    where: { id },
    select: { id: true, organizationId: true, projectId: true },
  });
  if (!current) throw notFound('Tarea no encontrada');

  await assertRelations(
    current.organizationId,
    input.businessUnitId,
    input.projectId,
  );

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id }, data: input });
    // Si la tarea se movió de proyecto, hay que recalcular ambos.
    const affected = new Set<string>();
    if (current.projectId) affected.add(current.projectId);
    if (task.projectId) affected.add(task.projectId);
    for (const pid of affected) await syncProjectStatus(pid, tx);
    return task;
  });
}
```

- [ ] **Step 4: Ampliar el `select` de `remove` y sincronizar**

Reemplaza la función `remove` actual:

```ts
export async function remove(id: string) {
  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Tarea no encontrada');
  await prisma.task.delete({ where: { id } });
}
```

por:

```ts
export async function remove(id: string) {
  const existing = await prisma.task.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw notFound('Tarea no encontrada');
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id } });
    if (existing.projectId) await syncProjectStatus(existing.projectId, tx);
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run build`
Expected: PASS sin errores.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tasks/tasks.service.ts
git commit -m "feat(tareas): sincronizar el estado del proyecto al crear/editar/eliminar tareas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verificación manual end-to-end

**Files:** ninguno (prueba manual).

Requisitos: BD arriba (`docker compose up -d` desde la raíz) y backend corriendo
(`cd backend && npm run dev`). Usa la UI (`frontend` con `npm run dev`) o llamadas a
la API. Lo más simple es la UI: crear proyecto y tareas, mover tareas en el Kanban
de `/tareas` o desde el detalle del proyecto.

- [ ] **Step 1: Camino feliz IDEA → IN_PROGRESS → COMPLETED**

  1. Crea un proyecto nuevo (queda en `IDEA`).
  2. Agrégale 2 tareas (ambas `TODO`). → El proyecto **sigue en `IDEA`**.
  3. Mueve 1 tarea a `DOING` (Kanban de `/tareas`). → El proyecto pasa a **`EN CURSO`**.
  4. Mueve ambas tareas a `DONE`. → El proyecto pasa a **`COMPLETADO`**.

  Verifica el badge en `/proyectos` y en `/proyectos/:id` (refresca o se refresca solo).

- [ ] **Step 2: Reversibilidad**

  5. Reabre una tarea del proyecto completado (`DONE` → `DOING`). → El proyecto vuelve a **`EN CURSO`**.

- [ ] **Step 3: Estados manuales protegidos**

  6. Edita el proyecto y ponlo en `PAUSADO` a mano.
  7. Mueve sus tareas (a `DONE`, por ejemplo). → El proyecto **sigue en `PAUSADO`** (no se toca).

- [ ] **Step 4: Mover tarea entre proyectos**

  8. Crea un segundo proyecto. Edita una tarea del primero y cámbiale el proyecto al segundo.
  9. Verifica que **ambos** proyectos recalcularon su estado coherentemente (el origen según las tareas que le quedan, el destino según las que recibió), siempre respetando los estados manuales.

- [ ] **Step 5: Caso borde — borrar todas las tareas de un completado**

  10. En un proyecto `COMPLETADO`, borra todas sus tareas. → Queda en **`COMPLETADO`** (sin tareas no hay opinión; es un cierre formal).

Si algún paso no se comporta como se describe, revisa `deriveStatus` y el `STATUS_AUTO`,
y que las mutaciones de tarea estén usando el cliente transaccional `tx` al llamar a
`syncProjectStatus`.

- [ ] **Step 6: Commit final (si hubo ajustes durante la verificación)**

Solo si corregiste algo:

```bash
git add backend/src
git commit -m "fix(proyectos): ajustes tras verificación manual de la sincronización de estado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Resumen de verificación final

- [ ] `cd backend && npm run build` pasa sin errores.
- [ ] Los 5 escenarios de la Tarea 3 se comportan según lo descrito.
- [ ] El frontend refleja los cambios de estado sin recargar manualmente (gracias a
  `invalidateTaskGraph` que ya invalida `['projects']` y `['dashboard']`).
