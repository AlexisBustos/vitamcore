# Notificación por correo al asignar una tarea — Plan de Implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar un correo (vía Resend) a cada usuario cuando queda como responsable **nuevo** de una tarea, y corregir el correo del usuario CEO a `a.bustos@vitam.tech`.

**Architecture:** Un módulo nuevo `tasks/task-notifications.service.ts` con dos unidades: una función pura `buildAssignmentEmail` (arma asunto/HTML/texto, sin BD ni red) y `notifyTaskAssigned` (carga los usuarios destino, excluye al actor, y llama a `sendEmail` por destinatario con aislamiento de errores). `tasks.service.ts` la invoca **después** de la transacción en `create` y `update`. La corrección del correo del CEO es un script de datos versionado, sin migración de esquema.

**Tech Stack:** TypeScript, Express, Prisma, Zod, Resend (HTTP), Vitest (contra BD Postgres de test).

**Spec:** `docs/superpowers/specs/2026-07-17-notificacion-correo-asignacion-tareas-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `backend/src/config/env.ts` | Añadir `APP_URL` (base para el enlace del correo) | Modificar |
| `backend/.env.example`, `backend/.env.production.example` | Documentar `APP_URL` | Modificar |
| `backend/src/modules/tasks/task-notifications.service.ts` | `buildAssignmentEmail` (pura) + `notifyTaskAssigned` (BD + envío) | Crear |
| `backend/src/modules/tasks/tasks.service.ts` | Llamar al notificador tras la transacción en `create`/`update` | Modificar |
| `backend/test/task-notifications.service.test.ts` | Tests del módulo de notificaciones | Crear |
| `backend/test/tasks.service.test.ts` | Test de integración: `create` dispara el envío | Modificar |
| `backend/scripts/fix-ceo-email.ts` | Renombrar el email del CEO en la BD (local y VPS) | Crear |
| `backend/prisma/seed.ts` | Default `CEO_EMAIL` → `a.bustos@vitam.tech` | Modificar |
| `CLAUDE.md` | Actualizar credenciales del seed | Modificar |

**Convención del proyecto:** cada request pasa por `routes → asyncHandler(controller) → controller valida con Zod → service → Prisma`. Los errores se lanzan con helpers de `utils/http-error.ts`. `env` se importa siempre desde `config/env.ts`. Tests con Vitest contra BD real: correr `npm run test:db:setup` una vez (Docker arriba) y luego `npm test`.

---

## Task 1: Config — variable `APP_URL`

**Files:**
- Modify: `backend/src/config/env.ts:21` (junto a `CORS_ORIGIN`)
- Modify: `backend/.env.example`, `backend/.env.production.example`

- [ ] **Step 1: Añadir `APP_URL` al schema de env**

En `backend/src/config/env.ts`, justo después de la línea de `CORS_ORIGIN`, añadir:

```ts
  // URL pública del frontend, usada para construir enlaces en correos.
  APP_URL: z.string().url().default('http://localhost:5173'),
```

- [ ] **Step 2: Documentar en los .env de ejemplo**

En `backend/.env.example` añadir una línea:

```
APP_URL=http://localhost:5173
```

En `backend/.env.production.example` añadir:

```
APP_URL=https://core.vitam.tech
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores (tsc sin salida).

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/env.ts backend/.env.example backend/.env.production.example
git commit -m "feat(config): APP_URL para enlaces en correos"
```

---

## Task 2: Función pura `buildAssignmentEmail`

Arma el contenido del correo. Sin BD, sin red: trivialmente testeable.

**Files:**
- Create: `backend/src/modules/tasks/task-notifications.service.ts`
- Test: `backend/test/task-notifications.service.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/task-notifications.service.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { buildAssignmentEmail } from '../src/modules/tasks/task-notifications.service';

describe('buildAssignmentEmail', () => {
  const base = {
    recipientName: 'Ana',
    taskTitle: 'Preparar informe',
    taskId: 't1',
    description: 'Detalle del informe',
    organizationName: 'Vitam Healthcare',
    projectName: 'Proyecto X',
    priority: 'HIGH' as const,
    dueDate: new Date('2026-07-20T00:00:00.000Z'),
    assignedByName: 'CEO VITAM',
  };

  test('asunto con el título de la tarea', () => {
    expect(buildAssignmentEmail(base).subject).toBe('Nueva tarea asignada: Preparar informe');
  });

  test('el enlace apunta al panel de la tarea (APP_URL + query tarea)', () => {
    const { html, text } = buildAssignmentEmail(base);
    // En entorno de test, APP_URL usa el default http://localhost:5173.
    expect(html).toContain('http://localhost:5173/tareas?tarea=t1');
    expect(text).toContain('http://localhost:5173/tareas?tarea=t1');
  });

  test('incluye saludo, prioridad legible y quién asignó', () => {
    const { html } = buildAssignmentEmail(base);
    expect(html).toContain('Ana');
    expect(html).toContain('Alta'); // HIGH → Alta
    expect(html).toContain('CEO VITAM');
  });

  test('omite la línea de vencimiento cuando no hay fecha', () => {
    const { html } = buildAssignmentEmail({ ...base, dueDate: null });
    expect(html).not.toContain('Vence');
  });

  test('el texto plano nunca va vacío (al menos título y enlace)', () => {
    const { text } = buildAssignmentEmail({ ...base, description: null });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Preparar informe');
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd backend && npx vitest run test/task-notifications.service.test.ts`
Expected: FAIL — `buildAssignmentEmail` no existe / módulo no encontrado.

- [ ] **Step 3: Implementar el módulo (solo la parte pura por ahora)**

Crear `backend/src/modules/tasks/task-notifications.service.ts`:

```ts
/**
 * Notificaciones por correo de asignación de tareas.
 *
 * Dos unidades: `buildAssignmentEmail` (pura, arma el contenido) y
 * `notifyTaskAssigned` (carga destinatarios y envía). El envío NUNCA rompe ni
 * revierte la asignación: `notifyTaskAssigned` captura sus propios errores.
 */
import type { Priority } from '@prisma/client';
import { env } from '../../config/env';

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

/// Fecha 'DD-MM-YYYY' de una fecha de calendario UTC.
function fechaLegible(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getUTCFullYear()}`;
}

export type AssignmentEmailInput = {
  recipientName: string;
  taskTitle: string;
  taskId: string;
  description?: string | null;
  organizationName?: string | null;
  projectName?: string | null;
  priority: Priority;
  dueDate?: Date | null;
  assignedByName?: string | null;
};

/** Arma asunto, HTML y texto plano del correo de asignación de un destinatario. */
export function buildAssignmentEmail(input: AssignmentEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const url = `${env.APP_URL}/tareas?tarea=${input.taskId}`;
  const contexto = [input.organizationName, input.projectName]
    .filter(Boolean)
    .join(' · ');

  const lineasHtml: string[] = [
    `<p>Hola ${input.recipientName},</p>`,
    `<p>Se te asignó una nueva tarea:</p>`,
    `<h2 style="margin:8px 0">${input.taskTitle}</h2>`,
  ];
  if (input.description) lineasHtml.push(`<p>${input.description}</p>`);
  if (contexto) lineasHtml.push(`<p><strong>Contexto:</strong> ${contexto}</p>`);
  lineasHtml.push(`<p><strong>Prioridad:</strong> ${PRIORITY_LABEL[input.priority]}</p>`);
  if (input.dueDate) {
    lineasHtml.push(`<p><strong>Vence:</strong> ${fechaLegible(input.dueDate)}</p>`);
  }
  if (input.assignedByName) {
    lineasHtml.push(`<p><strong>Asignada por:</strong> ${input.assignedByName}</p>`);
  }
  lineasHtml.push(
    `<p style="margin-top:16px">
       <a href="${url}"
          style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
         Abrir tarea
       </a>
     </p>`,
  );

  const lineasTexto: string[] = [
    `Hola ${input.recipientName},`,
    ``,
    `Se te asignó una nueva tarea: ${input.taskTitle}`,
  ];
  if (input.description) lineasTexto.push(input.description);
  if (contexto) lineasTexto.push(`Contexto: ${contexto}`);
  lineasTexto.push(`Prioridad: ${PRIORITY_LABEL[input.priority]}`);
  if (input.dueDate) lineasTexto.push(`Vence: ${fechaLegible(input.dueDate)}`);
  if (input.assignedByName) lineasTexto.push(`Asignada por: ${input.assignedByName}`);
  lineasTexto.push(``, `Abrir tarea: ${url}`);

  return {
    subject: `Nueva tarea asignada: ${input.taskTitle}`,
    html: lineasHtml.join('\n'),
    text: lineasTexto.join('\n'),
  };
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd backend && npx vitest run test/task-notifications.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tasks/task-notifications.service.ts backend/test/task-notifications.service.test.ts
git commit -m "feat(tareas): builder de correo de asignación (buildAssignmentEmail)"
```

---

## Task 3: `notifyTaskAssigned` (carga destinatarios + envío con aislamiento)

**Files:**
- Modify: `backend/src/modules/tasks/task-notifications.service.ts`
- Modify: `backend/test/task-notifications.service.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al inicio de `backend/test/task-notifications.service.test.ts` (arriba del todo, antes de los imports existentes) el mock de `sendEmail`, y un nuevo `describe`. El archivo completo de imports queda así:

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import {
  buildAssignmentEmail,
  notifyTaskAssigned,
} from '../src/modules/tasks/task-notifications.service';

// Mock del envío real: interceptamos sendEmail para no llamar a Resend.
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn() }));
import { sendEmail } from '../src/lib/email';
const sendEmailMock = vi.mocked(sendEmail);

beforeEach(async () => {
  await resetDb();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true, id: 'x' });
});
```

> Nota: si el archivo ya tenía `afterAll(disconnect)` no lo dupliques; añádelo si falta.

Añadir el `describe` de `notifyTaskAssigned` al final del archivo:

```ts
const baseTask = {
  id: 't1',
  title: 'Preparar informe',
  description: null,
  priority: 'MEDIUM' as const,
  dueDate: null,
};

describe('notifyTaskAssigned', () => {
  test('excluye al actor: si el único responsable nuevo es quien asigna, no envía', async () => {
    const actor = await makeUser({ name: 'Actor', email: 'actor@vitam.tech' });
    await notifyTaskAssigned({
      task: baseTask,
      organizationName: 'Org',
      projectName: null,
      recipientIds: [actor.id],
      actorId: actor.id,
      actorName: actor.name,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test('envía un correo por cada responsable nuevo (excluyendo al actor)', async () => {
    const actor = await makeUser({ name: 'Actor', email: 'actor@vitam.tech' });
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });
    const luis = await makeUser({ name: 'Luis', email: 'luis@vitam.tech' });
    await notifyTaskAssigned({
      task: baseTask,
      organizationName: 'Org',
      projectName: null,
      recipientIds: [ana.id, luis.id, actor.id],
      actorId: actor.id,
      actorName: actor.name,
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const destinatarios = sendEmailMock.mock.calls.map((c) => c[0].to);
    expect(destinatarios).toEqual(
      expect.arrayContaining(['ana@vitam.tech', 'luis@vitam.tech']),
    );
  });

  test('un fallo enviando a uno NO impide enviar al resto ni propaga el error', async () => {
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });
    const luis = await makeUser({ name: 'Luis', email: 'luis@vitam.tech' });
    sendEmailMock.mockRejectedValueOnce(new Error('Resend 500'));
    await expect(
      notifyTaskAssigned({
        task: baseTask,
        organizationName: null,
        projectName: null,
        recipientIds: [ana.id, luis.id],
      }),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).toHaveBeenCalledTimes(2); // el segundo igual se intentó
  });

  test('sin responsables nuevos no consulta ni envía', async () => {
    await notifyTaskAssigned({
      task: baseTask,
      organizationName: null,
      projectName: null,
      recipientIds: [],
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd backend && npx vitest run test/task-notifications.service.test.ts`
Expected: FAIL — `notifyTaskAssigned` no está exportada.

- [ ] **Step 3: Implementar `notifyTaskAssigned`**

Añadir a `backend/src/modules/tasks/task-notifications.service.ts` (nuevos imports arriba y la función al final):

```ts
import { prisma } from '../../lib/prisma';
import { sendEmail } from '../../lib/email';
import { logger } from '../../lib/logger';
```

```ts
export type NotifyTaskAssignedInput = {
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: Priority;
    dueDate: Date | null;
  };
  organizationName: string | null;
  projectName: string | null;
  /** Responsables NUEVOS (los que no estaban antes en la tarea). */
  recipientIds: string[];
  /** Quien hace la asignación; se excluye de los destinatarios. */
  actorId?: string;
  actorName?: string | null;
};

/**
 * Notifica por correo a cada responsable nuevo. Nunca lanza: captura sus
 * errores y los loguea, para no romper ni revertir la asignación.
 */
export async function notifyTaskAssigned(input: NotifyTaskAssignedInput): Promise<void> {
  try {
    const ids = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
    if (ids.length === 0) return;

    const users = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, email: true },
    });

    for (const user of users) {
      // Sin email concreto NO se llama a sendEmail: resolveRecipients caería a
      // REPORT_EMAIL_TO y desviaría el aviso al destinatario del informe semanal.
      if (!user.email) continue;
      const mail = buildAssignmentEmail({
        recipientName: user.name,
        taskTitle: input.task.title,
        taskId: input.task.id,
        description: input.task.description,
        organizationName: input.organizationName,
        projectName: input.projectName,
        priority: input.task.priority,
        dueDate: input.task.dueDate,
        assignedByName: input.actorName,
      });
      try {
        await sendEmail({
          to: user.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      } catch (err) {
        logger.error(
          { err, userId: user.id, taskId: input.task.id },
          'Fallo al enviar correo de asignación de tarea',
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error inesperado en notifyTaskAssigned');
  }
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd backend && npx vitest run test/task-notifications.service.test.ts`
Expected: PASS (9 tests: 5 del builder + 4 de notifyTaskAssigned).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tasks/task-notifications.service.ts backend/test/task-notifications.service.test.ts
git commit -m "feat(tareas): notifyTaskAssigned envía correo por responsable nuevo"
```

---

## Task 4: Enganche en `tasks.service.ts` (create y update)

**Files:**
- Modify: `backend/src/modules/tasks/tasks.service.ts` (imports; `create` ~124-141; `update` ~182-214; helper privado nuevo)
- Modify: `backend/test/tasks.service.test.ts` (test de integración)

- [ ] **Step 1: Escribir los tests de integración que fallan**

En `backend/test/tasks.service.test.ts`:

**(a)** Añadir el mock de `sendEmail` al inicio del archivo (bajo los imports existentes):

```ts
import { vi } from 'vitest';
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn() }));
import { sendEmail } from '../src/lib/email';
const sendEmailMock = vi.mocked(sendEmail);
```

**(b)** IMPORTANTE — nombres reales en este archivo: el servicio se importa como
`import * as tasks from '../src/modules/tasks/tasks.service'` (alias **`tasks`**,
no `service`), así que las llamadas son `tasks.create(...)` / `tasks.update(...)`.
Y `asAuthUser` **no** está importado hoy: añádelo al import de fixtures
(hoy la línea es `import { makeOrg, makeUser } from './fixtures';` → pasa a
`import { makeOrg, makeUser, asAuthUser } from './fixtures';`). Verifica los
nombres exactos en las primeras líneas del archivo antes de pegar.

**(c)** Añadir el `describe` de integración (cubre `create` y `update`):

```ts
describe('notificación de asignación (integración)', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ sent: true, id: 'x' });
  });

  test('create: al asignar una tarea a otro usuario, se envía un correo', async () => {
    const org = await makeOrg();
    const actor = await makeUser({ name: 'CEO', email: 'ceo@vitam.tech', role: 'CEO' });
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });

    await tasks.create(
      { organizationId: org.id, title: 'Tarea con responsable', assigneeIds: [ana.id] },
      asAuthUser(actor),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('ana@vitam.tech');
  });

  test('update: agregar un responsable nuevo notifica solo al nuevo', async () => {
    const org = await makeOrg();
    const actor = await makeUser({ name: 'CEO', email: 'ceo@vitam.tech', role: 'CEO' });
    const ana = await makeUser({ name: 'Ana', email: 'ana@vitam.tech' });
    const luis = await makeUser({ name: 'Luis', email: 'luis@vitam.tech' });

    // Tarea que ya tiene a Ana como responsable.
    const tarea = await tasks.create(
      { organizationId: org.id, title: 'Tarea', assigneeIds: [ana.id] },
      asAuthUser(actor),
    );
    sendEmailMock.mockClear(); // olvidar el correo del create

    // Update: el set pasa a [Ana, Luis]. Solo Luis es nuevo.
    await tasks.update(tarea.id, { assigneeIds: [ana.id, luis.id] }, asAuthUser(actor));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('luis@vitam.tech');
  });
});
```

> Nota de aislamiento: como este archivo ahora mockea `../src/lib/email`, el mock
> aplica a TODO el archivo. Ningún otro test de tareas depende del envío real, así
> que es seguro; si al correr aparece algún rojo inesperado, revisa que no haya un
> test previo que asumiera el envío real (no debería haberlo).

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd backend && npx vitest run test/tasks.service.test.ts -t "notificación de asignación"`
Expected: FAIL — `sendEmail` no fue llamado (aún no está el enganche).

- [ ] **Step 3: Implementar el enganche**

En `backend/src/modules/tasks/tasks.service.ts`:

(a) Añadir el import del notificador junto a los otros imports del módulo:

```ts
import { notifyTaskAssigned } from './task-notifications.service';
```

(b) Añadir un helper privado (al final del archivo, junto a `assertRelations`):

```ts
/**
 * Carga nombres de empresa/proyecto y notifica por correo a los responsables
 * nuevos. Se llama SIEMPRE fuera de la transacción; nunca lanza.
 */
async function maybeNotifyAssigned(
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: Prisma.TaskGetPayload<object>['priority'];
    dueDate: Date | null;
    organizationId: string;
    projectId: string | null;
  },
  recipientIds: string[],
  user?: AuthUser,
) {
  if (recipientIds.length === 0) return;
  const [organization, project] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: task.organizationId },
      select: { name: true },
    }),
    task.projectId
      ? prisma.project.findUnique({
          where: { id: task.projectId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  await notifyTaskAssigned({
    task,
    organizationName: organization?.name ?? null,
    projectName: project?.name ?? null,
    recipientIds,
    actorId: user?.id,
    actorName: user?.name ?? null,
  });
}
```

(c) En `create`, cambiar el `return prisma.$transaction(...)` para capturar el resultado y notificar después. Es decir, reemplazar:

```ts
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data });
    ...
    if (task.projectId) await syncProjectStatus(task.projectId, tx);
    return task;
  });
}
```

por:

```ts
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({ data });
    if (labelIds?.length) {
      await tx.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId: created.id, labelId })),
      });
    }
    if (assigneeIds.length) {
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: created.id, userId })),
      });
    }
    await recordActivity(tx, created.id, user?.id, [
      { type: TaskActivityType.CREATED, data: {} },
    ]);
    if (created.projectId) await syncProjectStatus(created.projectId, tx);
    return created;
  });
  // En create todos los responsables son nuevos.
  await maybeNotifyAssigned(task, assigneeIds, user);
  return task;
}
```

(d) En `update`, capturar el resultado, calcular los responsables nuevos con `current.assignees` y notificar. Reemplazar el cierre:

```ts
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id }, data });
    ...
    for (const pid of affected) await syncProjectStatus(pid, tx);
    return task;
  });
}
```

por:

```ts
  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id }, data });
    if (labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } });
      if (labelIds.length) {
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({ taskId: id, labelId })),
        });
      }
    }
    if (assigneeIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      if (assigneeIds.length) {
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((userId) => ({ taskId: id, userId })),
        });
      }
    }
    await recordActivity(
      tx,
      id,
      user?.id,
      await buildUpdateEvents(tx, current, input, labelIds, assigneeIds),
    );
    const affected = new Set<string>();
    if (current.projectId) affected.add(current.projectId);
    if (updated.projectId) affected.add(updated.projectId);
    for (const pid of affected) await syncProjectStatus(pid, tx);
    return updated;
  });
  // Responsables nuevos = los que no estaban antes en la tarea.
  const before = new Set(current.assignees.map((a) => a.userId));
  const nuevos = assigneeIds ? assigneeIds.filter((u) => !before.has(u)) : [];
  await maybeNotifyAssigned(task, nuevos, user);
  return task;
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd backend && npx vitest run test/tasks.service.test.ts`
Expected: PASS (incluido el nuevo test de integración; los demás de tasks siguen verdes).

- [ ] **Step 5: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tasks/tasks.service.ts backend/test/tasks.service.test.ts
git commit -m "feat(tareas): notificar por correo al asignar responsables (create y update)"
```

---

## Task 5: Corrección del correo del CEO

**Files:**
- Create: `backend/scripts/fix-ceo-email.ts`
- Modify: `backend/prisma/seed.ts:37`
- Modify: `CLAUDE.md` (línea de credenciales del seed)

- [ ] **Step 1: Crear el script de corrección de datos**

Crear `backend/scripts/fix-ceo-email.ts`:

```ts
/**
 * Renombra el email del usuario CEO de ceo@vitam.tech a a.bustos@vitam.tech.
 * Idempotente y seguro: si el destino ya existe o el origen no está, no toca
 * nada y explica por qué. Correr una vez por entorno (local y VPS):
 *   npx tsx scripts/fix-ceo-email.ts
 */
import { PrismaClient } from '@prisma/client';

const VIEJO = 'ceo@vitam.tech';
const NUEVO = 'a.bustos@vitam.tech';

const prisma = new PrismaClient();

async function main() {
  const yaNuevo = await prisma.user.findUnique({ where: { email: NUEVO } });
  if (yaNuevo) {
    console.log(`El usuario ${NUEVO} ya existe. Nada que hacer.`);
    return;
  }
  const viejo = await prisma.user.findUnique({ where: { email: VIEJO } });
  if (!viejo) {
    console.log(`No hay usuario con email ${VIEJO}. Nada que hacer.`);
    return;
  }
  await prisma.user.update({ where: { email: VIEJO }, data: { email: NUEVO } });
  console.log(`✅ Email del CEO actualizado: ${VIEJO} → ${NUEVO}`);
}

main()
  .catch((e) => {
    console.error('❌ Error corrigiendo el email del CEO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Ejecutar el script en local**

Run: `cd backend && npx tsx scripts/fix-ceo-email.ts`
Expected: `✅ Email del CEO actualizado: ceo@vitam.tech → a.bustos@vitam.tech`
(o el mensaje de "ya existe / nada que hacer" si se corre dos veces).

- [ ] **Step 3: Actualizar el default del seed**

En `backend/prisma/seed.ts:37`, cambiar:

```ts
const CEO_EMAIL = process.env.SEED_CEO_EMAIL ?? 'ceo@vitam.tech';
```

por:

```ts
const CEO_EMAIL = process.env.SEED_CEO_EMAIL ?? 'a.bustos@vitam.tech';
```

- [ ] **Step 4: Actualizar credenciales en CLAUDE.md**

En `CLAUDE.md`, la línea de credenciales del seed cambia de `ceo@vitam.tech` a `a.bustos@vitam.tech`:

```
Credenciales del seed: `a.bustos@vitam.tech` / `VitamCore2026!` (definidas en `backend/.env`).
```

- [ ] **Step 5: Verificar login local**

Reiniciar el backend (`npm run dev`) y confirmar que el login con `a.bustos@vitam.tech` + la clave del seed funciona (o mediante la app, o un `curl` a `/api/auth/login`).

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/fix-ceo-email.ts backend/prisma/seed.ts CLAUDE.md
git commit -m "fix(usuarios): corregir email del CEO a a.bustos@vitam.tech (script + seed)"
```

---

## Task 6: Verificación completa

- [ ] **Step 1: Typecheck del backend**

Run: `cd backend && npm run build`
Expected: sin errores.

- [ ] **Step 2: Suite completa de tests**

Run: `cd backend && npm test`
Expected: todos los tests verdes (los ~264 previos + los nuevos de notificación e integración).

- [ ] **Step 3: Prueba manual con Resend (opcional en local, recomendado)**

Con `RESEND_API_KEY` configurada: crear una tarea asignada a un usuario con correo real → llega el correo con el enlace `…/tareas?tarea=<id>`. Asignarse una tarea a uno mismo → **no** llega correo.

---

## Task 7: Despliegue al VPS

Sigue el flujo de `[[vps-deploy-guia]]`. **Requiere un paso extra**: definir `APP_URL` en el `.env` de producción y correr el script del CEO una vez.

- [ ] **Step 1: Merge a main y push**

```bash
git checkout develop && git push origin develop
git checkout main && git merge --ff-only develop && git push origin main
git checkout develop
```

- [ ] **Step 2: Backup de la BD productiva**

```bash
ssh root@64.176.18.197 'sudo -u postgres pg_dump vitamcore_db > /home/vitam/backups/vitamcore_$(date +%Y%m%d_%H%M%S).sql'
```

- [ ] **Step 3: Añadir `APP_URL` al `.env` de producción**

En el VPS, editar `/home/vitam/apps/vitamcore/backend/.env` y añadir (si no está):

```
APP_URL=https://core.vitam.tech
```

(El backend valida env al arrancar; sin esto `APP_URL` cae al default localhost y los enlaces del correo apuntarían mal, pero no rompe.)

- [ ] **Step 4: Deploy**

```bash
ssh root@64.176.18.197 'sudo -u vitam bash /home/vitam/apps/vitamcore/deploy.sh'
```

- [ ] **Step 5: Corregir el email del CEO en producción**

```bash
ssh root@64.176.18.197 'cd /home/vitam/apps/vitamcore/backend && sudo -u vitam npx tsx scripts/fix-ceo-email.ts'
```
Expected: `✅ Email del CEO actualizado…` (o "ya existe" si se repite).

- [ ] **Step 6: Verificar**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://core.vitam.tech
curl -s https://core.vitam.tech/api/health
```
Expected: `200` y `{"status":"ok",...}`. Confirmar login con `a.bustos@vitam.tech` y probar una asignación real de tarea a un colaborador con correo → llega el correo.

- [ ] **Step 7: Actualizar memoria y log de deploy en Notion**

Registrar el deploy en la guía de Notion (`[[vps-deploy-guia]]`) y actualizar la memoria del proyecto con el estado del feature.

---

## Notas finales

- **DRY**: `buildAssignmentEmail` es la única fuente del contenido del correo; `notifyTaskAssigned` la reutiliza por destinatario; `maybeNotifyAssigned` centraliza la carga de nombres para `create` y `update`.
- **YAGNI**: sin preferencias por usuario, sin cola de reintentos, sin notificación de proyectos ni de remoción de responsables (ver spec, "Fuera de alcance").
- **Seguridad del flujo**: el correo se envía siempre **fuera** de la transacción y `notifyTaskAssigned` nunca lanza; una falla de Resend no revierte ni bloquea la asignación.
