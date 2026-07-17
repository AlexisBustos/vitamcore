# Notificación por correo al asignar una tarea

**Fecha:** 2026-07-17
**Estado:** Diseño aprobado

## Problema

Cuando se asigna una tarea a un usuario (responsable), este no se entera hasta
que entra al sistema. Se quiere que, al quedar como responsable de una tarea,
reciba un correo avisándole, con los datos de la tarea y un enlace para abrirla.
El sistema ya está integrado con Resend (`src/lib/email.ts`), hoy usado por el
informe semanal.

Problema adicional acoplado: el usuario CEO tiene `email: ceo@vitam.tech` en la
base de datos, que **no es el correo real** del CEO. Debe ser
`a.bustos@vitam.tech`, si no la notificación (y cualquier correo dirigido al
CEO) llegaría a una casilla equivocada.

## Decisiones de producto

| Decisión | Valor |
|---|---|
| Cuándo se notifica | Al **crear** una tarea con responsables y al **actualizar** una tarea agregando responsables nuevos |
| A quién | A cada responsable **nuevo** (los que no estaban antes en la tarea) |
| Auto-asignación | **No** se notifica al propio actor que hace la asignación (si te asignas a ti mismo, no te llega correo) |
| Alcance | **Solo tareas** (la asignación de responsable/owner de proyectos queda fuera) |
| Formato de envío | **Un correo personalizado por responsable** (saludo por nombre + enlace), no un único correo con todos en copia |
| Correo del CEO | Se **cambia por completo** el `email` del usuario CEO de `ceo@vitam.tech` a `a.bustos@vitam.tech`: login **y** notificaciones. Tras el cambio, el CEO inicia sesión con `a.bustos@vitam.tech` y la misma clave |
| Degradación | Sin `RESEND_API_KEY` (local), `sendEmail` ya simula sin fallar; el flujo de tareas funciona igual |

## Enfoque

Se evaluaron tres formas de disparar el correo:

- **A) Inline en el service** — enviar dentro de `create`/`update`. Simple pero
  mezcla responsabilidades y arriesga enviar dentro de la transacción.
- **B) Módulo de notificaciones dedicado** *(elegido)* — un
  `tasks/task-notifications.service.ts` con una función
  `notifyTaskAssigned(...)`, llamada **después** de que la transacción confirma.
  Aislado, testeable, sigue la convención modular del proyecto.
- **C) Vía el log de actividad** — enganchar al evento `ASSIGNED`. El recorder
  corre **dentro** de la transacción (mal lugar para enviar correo) y añade
  indirección innecesaria.

Se elige **B**. Un principio transversal: **el envío del correo nunca debe
romper ni revertir la asignación**. Por eso ocurre fuera de la transacción, es
fire-and-forget y captura sus propios errores.

## Componente 1 — `tasks/task-notifications.service.ts` (nuevo)

Módulo con una única responsabilidad pública:

```ts
notifyTaskAssigned(input: {
  task: { id; title; description; priority; dueDate; ... };
  organizationName: string | null;
  projectName: string | null;
  recipientIds: string[];   // responsables NUEVOS
  actorId?: string;         // quien hizo la asignación (se excluye)
}): Promise<void>
```

Comportamiento:

1. Excluir al `actorId` de `recipientIds`. Si no queda nadie, retorna sin hacer
   nada (ni una consulta).
2. Cargar de `User` los destinatarios restantes: `id`, `name`, `email`,
   `isActive`. Descartar inactivos o sin email (defensa; hoy `email` es
   obligatorio y `assertAssignableUsers` ya exige activos).
3. Para cada destinatario, construir asunto/HTML/texto (Componente 3) y llamar
   `sendEmail(...)` de `src/lib/email.ts`.
4. **El envío de cada destinatario va en su propio `try/catch`** (dentro del
   bucle) que loguea con `logger` y sigue con el siguiente. Esto es
   deliberado: `sendEmail` **sí lanza** ante una respuesta no-2xx de Resend
   (`email.ts` solo retorna en silencio cuando falta la key o no hay
   destinatario), así que un fallo enviando al responsable #1 no debe impedir
   que #2 reciba su correo. Un `try/catch` externo adicional envuelve la carga
   de usuarios. En ningún caso `notifyTaskAssigned` relanza al llamador.

   Guard explícito: como `resolveRecipients` de `email.ts` cae a
   `env.REPORT_EMAIL_TO` cuando el `to` viene vacío, **nunca** se llama a
   `sendEmail` sin un `to` concreto (los destinatarios sin email se descartan en
   el paso 2). Así una notificación de tarea jamás se desvía al destinatario del
   informe semanal.

Interfaz clara: el llamador le pasa datos ya cargados (task + nombres) y la
lista de ids nuevos; el módulo no conoce Prisma-de-tareas ni transacciones, solo
`User` (para email/nombre) y `sendEmail`. Se puede testear en aislamiento
mockeando `sendEmail`.

## Componente 2 — Puntos de disparo en `tasks.service.ts`

El cálculo de responsables nuevos ya es trivial en ambos flujos; lo que cambia
es **devolverlos desde la transacción** y llamar al notificador tras confirmar.

- **`create`**: los responsables nuevos son **todos** los `assigneeIds`. La
  transacción pasa a devolver `{ task, nuevosResponsables: assigneeIds }`. Tras
  el `await`, se llama a `notifyTaskAssigned` con `actorId = user?.id`. La
  función pública sigue devolviendo `task` (el controller no cambia).
- **`update`**: los responsables nuevos son los `added` (los `assigneeIds` que
  no estaban en `current.assignees`). Hoy ese diff se calcula dentro de
  `buildUpdateEvents`; se calcula también (o se reutiliza) para devolver
  `{ task, nuevosResponsables }` desde la transacción. Si `assigneeIds` es
  `undefined` (el update no tocó responsables), `nuevosResponsables = []` y no
  se notifica. Tras el `await`, misma llamada con `actorId = user?.id`.

Para construir el correo hacen falta los nombres de empresa y proyecto: se
obtienen con una lectura ligera tras la transacción (o incluyéndolos en el
`select`/`include` del `task`), evitando N+1. Estos nombres se pasan al
notificador; el módulo de notificaciones no vuelve a consultarlos.

Modelo de ejecución (sin ambigüedad): se hace **`await notifyTaskAssigned(...)`**
tras la transacción. Esto **sí** retiene la respuesta al cliente hasta que
terminan los envíos (secuenciales, uno por destinatario), lo cual es aceptable
por el bajo volumen (una app de pocos usuarios, pocos responsables por tarea). Se
prefiere `await` a disparar-y-olvidar (`void`/`queueMicrotask`) para no dejar
promesas colgando ni logs huérfanos. Es seguro porque `notifyTaskAssigned`
**nunca lanza** (captura sus errores internamente): un fallo de correo no cambia
el resultado de la request, que ya devolvió la tarea asignada.

## Componente 3 — Contenido del correo

Una función pura (mismo archivo del Componente 1, no exportada o exportada solo
para test) construye el correo de un destinatario:

- **Asunto**: `Nueva tarea asignada: <título>`
- **HTML**: saludo por nombre (`Hola <nombre>,`), luego el título de la tarea y,
  cuando existan: descripción, `empresa · proyecto`, prioridad (etiqueta legible
  en español), fecha de vencimiento (formato `DD-MM-YYYY`) y **quién la asignó**
  (nombre del actor; si no hay actor, se omite la línea). Cierra con un botón
  **"Abrir tarea"** enlazando a `${APP_URL}/tareas?tarea=<task.id>` (el frontend
  ya abre el panel de la tarea con el query param `tarea`).
- **Texto plano**: misma información en texto, como respaldo (`text` de
  `SendEmailInput`). Siempre **no vacío** (al menos título + enlace), porque
  `sendEmail` solo reenvía `text` cuando es truthy.
- **Remitente**: `core@vitam.tech` (default de `REPORT_EMAIL_FROM`, dominio ya
  verificado en Resend). El `to` es el correo del destinatario.

Los campos opcionales ausentes simplemente no aparecen (sin líneas vacías). El
mapeo de prioridad y el formato de fecha reutilizan helpers existentes donde los
haya (p. ej. la traducción de prioridad ya usada en el frontend/otros correos);
si no hay uno en backend, se define un mapa local pequeño.

## Componente 4 — Configuración (`src/config/env.ts`)

- Nueva variable **`APP_URL`**: `z.string().url().default('http://localhost:5173')`.
  En producción se define `APP_URL=https://core.vitam.tech`. Se usa solo para
  construir el enlace del correo. (Se prefiere una variable dedicada a reutilizar
  `CORS_ORIGIN` para no acoplar la construcción de enlaces a la config de CORS.)
- Se añade `APP_URL` a `.env.example` y `.env.production.example`
  (`APP_URL=https://core.vitam.tech`).

## Componente 5 — Corrección del correo del CEO

Dos partes:

1. **Dato existente (local y producción)**: el usuario CEO ya creado tiene
   `email = ceo@vitam.tech`. El `upsert` del seed busca por email, así que
   re-sembrar **no** lo renombra. Se corrige con un **script versionado y
   reproducible** `backend/scripts/fix-ceo-email.ts` (patrón `tsx`, como los
   demás scripts del proyecto) que: verifica que no exista ya
   `a.bustos@vitam.tech` y que exista `ceo@vitam.tech`, y hace
   `prisma.user.update({ where: { email: 'ceo@vitam.tech' }, data: { email: 'a.bustos@vitam.tech' } })`.
   Se ejecuta una vez por entorno (local y VPS) y queda en el repo para
   auditoría. `email` es `@unique`: si ya existiera el destino, el script aborta
   con mensaje claro en vez de reventar con `P2002`.
2. **Seed (futuros entornos)**: el default de `CEO_EMAIL` en `prisma/seed.ts`
   pasa de `ceo@vitam.tech` a `a.bustos@vitam.tech` (sigue siendo
   sobreescribible por `SEED_CEO_EMAIL`). Así una base nueva nace con el correo
   correcto. Se actualizan también: el `console.log` de credenciales del seed, la
   tabla de credenciales de `CLAUDE.md` (hoy muestra `ceo@vitam.tech`) y la
   memoria del proyecto.

Impacto de login: tras el cambio, **el CEO inicia sesión con
`a.bustos@vitam.tech`** y la misma contraseña. Se le comunica explícitamente.

## Fuera de alcance / notas

- No se notifica la asignación de **proyectos** (owner/miembros). Solo tareas.
- No se notifica la **remoción** de un responsable ni otros cambios de la tarea
  (estado, fechas, etiquetas). Solo la **alta** de responsables nuevos.
- No hay preferencias por usuario de "quiero/no quiero correos" (YAGNI para una
  app de pocos usuarios). Si en el futuro se necesita, es un campo en `User`.
- No hay reintentos ni cola de envío: si Resend falla, se loguea y se pierde ese
  aviso (la tarea igual queda asignada y visible en la app). Aceptable para el
  volumen actual.
- No se toca `schema.prisma` salvo que se decida lo contrario: la corrección del
  correo del CEO es un `UPDATE` de datos, no una migración de esquema. No hay
  columnas nuevas.

## Verificación

- **Typecheck**: `npm run build` (backend).
- **Tests (Vitest, backend)** para `task-notifications.service.ts`, mockeando
  `sendEmail`:
  - Excluye al `actorId`: si el único responsable nuevo es el actor, no se envía
    ningún correo.
  - Envía un correo por cada responsable nuevo restante (destinatarios y conteo
    correctos).
  - Asunto y enlace bien formados (`Nueva tarea asignada: …` y
    `${APP_URL}/tareas?tarea=<id>`).
  - Si `sendEmail` lanza, `notifyTaskAssigned` **no** propaga el error.
  - Sin responsables nuevos (`recipientIds` vacío) no consulta usuarios ni envía.
- **Prueba manual** (con `RESEND_API_KEY` en local o en el VPS): crear una tarea
  asignada a un usuario con correo real y verificar que llega el correo con el
  enlace correcto; asignarse a uno mismo y verificar que **no** llega.
- **Corrección CEO**: iniciar sesión con `a.bustos@vitam.tech` tras la
  actualización.
