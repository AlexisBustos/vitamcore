# Usuarios y control de acceso por rol (RBAC) — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir dos tipos de usuario efectivos —acceso total (CEO/ADMIN, con gestión de usuarios) y COLABORADOR (solo Proyectos y Tareas)— con bloqueo real en backend y gating en frontend.

**Architecture:** Enfoque A (allowlist por rol). Backend: un middleware de autorización (`requireRole` / `allowRoles`) aplicado por router en `routes/index.ts`, con 3 niveles (total / solo-lectura / 403), más un módulo `users` CRUD. Frontend: helpers de permisos que filtran el menú y envuelven las rutas solo-admin, más una página `/usuarios`.

**Tech Stack:** Express + Prisma (PostgreSQL) + Zod + Vitest (backend); React + Vite + TanStack Query + Tailwind v4 (frontend). bcryptjs para hashing.

**Spec:** `docs/superpowers/specs/2026-07-02-usuarios-roles-rbac-design.md`

**Convenciones del repo a respetar:**
- Backend modular por dominio: `*.routes.ts` (envuelve en `asyncHandler`), `*.controller.ts` (parsea con Zod `.parse()`, responde `{ data }`), `*.service.ts` (lógica + Prisma, errores vía `utils/http-error`), `*.schema.ts` (Zod).
- Tests backend prueban **services directamente** (no HTTP), con `beforeEach(resetDb)` / `afterAll(disconnect)` y fixtures de `test/fixtures.ts`. La autorización, al ser middleware puro, se prueba **unitariamente** con `req`/`next` simulados.
- Frontend: nunca `fetch` directo; todo por `lib/api.ts` y hooks de React Query que invalidan sus query keys en `onSuccess`. Verificación = `npm run lint` (typecheck). No hay framework de tests de frontend.
- Todo en español (comentarios, mensajes de error de la API); identificadores de dominio (enum Prisma, tipos) en inglés.

---

## Estructura de archivos

**Backend — crear:**
- `backend/src/modules/shared/roles.ts` — única fuente de roles y del predicado "es admin".
- `backend/src/middleware/authorize.ts` — `requireRole`, `allowRoles`.
- `backend/src/modules/users/users.schema.ts` — Zod create/update.
- `backend/src/modules/users/users.service.ts` — CRUD + reglas de seguridad.
- `backend/src/modules/users/users.controller.ts` — HTTP ↔ service.
- `backend/src/modules/users/users.routes.ts` — router.
- `backend/test/authorize.test.ts` — tests unitarios del middleware.
- `backend/test/users.service.test.ts` — tests del service.

**Backend — modificar:**
- `backend/prisma/schema.prisma` — agregar `COLABORADOR` al enum `Role`.
- `backend/src/utils/http-error.ts` — helper `forbidden` (403).
- `backend/src/routes/index.ts` — cablear autorización por router + montar `/users`.
- `backend/prisma/seed.ts` — colaborador de prueba idempotente.
- `backend/test/db.ts` — agregar `"users"` al TRUNCATE de `resetDb`.
- `backend/test/fixtures.ts` — fixture `makeUser`.

**Frontend — crear:**
- `frontend/src/lib/permissions.ts` — `isAdmin`, `COLLABORATOR_PATHS`, `canAccessPath`, `landingPath`.
- `frontend/src/routes/RequireAdmin.tsx` — wrapper de rutas solo-admin.
- `frontend/src/hooks/useUsers.ts` — queries/mutaciones de usuarios.
- `frontend/src/pages/users/UsersPage.tsx` — tabla + alta/edición.
- `frontend/src/pages/users/UserForm.tsx` — formulario de alta/edición.

**Frontend — modificar:**
- `frontend/src/lib/nav.ts` — agregar entrada **Usuarios**.
- `frontend/src/components/layout/Sidebar.tsx` — filtrar `navItems` por rol.
- `frontend/src/App.tsx` — reestructurar rutas (compartidas vs. `RequireAdmin`).

---

## Chunk 1: Backend — roles y autorización

### Task 1: Enum de rol + helpers de roles + `forbidden`

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum `Role`, líneas ~22-25)
- Create: `backend/src/modules/shared/roles.ts`
- Modify: `backend/src/utils/http-error.ts`

- [ ] **Step 1: Agregar `COLABORADOR` al enum `Role`**

En `backend/prisma/schema.prisma`:

```prisma
/// Roles disponibles.
enum Role {
  CEO          // dueño / super-usuario — acceso total
  ADMIN        // acceso total + gestión de usuarios
  COLABORADOR  // solo Proyectos y Tareas
}
```

- [ ] **Step 2: Crear la migración y regenerar el cliente**

Asegúrate de que la BD de desarrollo esté arriba (`docker compose up -d` desde la raíz). Luego, desde `backend/`:

Run: `npx prisma migrate dev --name add_colaborador_role`
Expected: crea `prisma/migrations/<timestamp>_add_colaborador_role/` y regenera el cliente Prisma sin errores.

> Nota: NO uses `npm run prisma:migrate` (su `--name` está fijo en `init`).

- [ ] **Step 3: Crear el helper de roles**

`backend/src/modules/shared/roles.ts`:

```ts
/**
 * Definición única de roles y del predicado "es administrador".
 * Consumido por el middleware de autorización y por el service de usuarios.
 */
export const ADMIN_ROLES = ['CEO', 'ADMIN'] as const;
export const ALL_ROLES = ['CEO', 'ADMIN', 'COLABORADOR'] as const;

/** True si el rol tiene acceso total (CEO o ADMIN). */
export function isAdminRole(role: string): boolean {
  return role === 'CEO' || role === 'ADMIN';
}
```

- [ ] **Step 4: Agregar el helper `forbidden` (403)**

En `backend/src/utils/http-error.ts`, tras `notFound`:

```ts
export const forbidden = (msg = 'Acceso denegado') => new HttpError(403, msg);
```

- [ ] **Step 5: Verificar compilación**

Run: `npm run build`
Expected: sin errores de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modules/shared/roles.ts backend/src/utils/http-error.ts
git commit -m "feat(back): rol COLABORADOR, helpers de roles y forbidden(403)"
```

---

### Task 2: Middleware de autorización (TDD)

**Files:**
- Create: `backend/test/authorize.test.ts`
- Create: `backend/src/middleware/authorize.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/test/authorize.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireRole, allowRoles } from '../src/middleware/authorize';
import { ADMIN_ROLES, ALL_ROLES } from '../src/modules/shared/roles';

// Construye una request simulada con un usuario de cierto rol y método.
function mockReq(role: string | undefined, method = 'GET'): Request {
  return { method, user: role ? { id: 'u1', name: 'U', email: 'u@t', role } : undefined } as unknown as Request;
}
const res = {} as Response;

// Ejecuta el middleware y devuelve el argumento con que se llamó a next().
function run(mw: (req: Request, res: Response, next: NextFunction) => void, req: Request) {
  const next = vi.fn();
  mw(req, res, next);
  return next.mock.calls[0]?.[0]; // undefined = permitido; error = bloqueado
}

describe('requireRole', () => {
  test('permite si el rol está en la lista', () => {
    expect(run(requireRole(...ADMIN_ROLES), mockReq('ADMIN'))).toBeUndefined();
  });
  test('bloquea con 403 si el rol no está en la lista', () => {
    const err = run(requireRole(...ADMIN_ROLES), mockReq('COLABORADOR'));
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
  });
  test('bloquea con 401 si no hay usuario', () => {
    const err = run(requireRole(...ADMIN_ROLES), mockReq(undefined));
    expect(err.statusCode).toBe(401);
  });
});

describe('allowRoles (lectura vs escritura)', () => {
  const mw = allowRoles({ read: ALL_ROLES, write: ADMIN_ROLES });
  test('COLABORADOR puede GET', () => {
    expect(run(mw, mockReq('COLABORADOR', 'GET'))).toBeUndefined();
  });
  test('COLABORADOR NO puede POST (403)', () => {
    expect(run(mw, mockReq('COLABORADOR', 'POST')).statusCode).toBe(403);
  });
  test('ADMIN puede POST', () => {
    expect(run(mw, mockReq('ADMIN', 'POST'))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- authorize`
Expected: FAIL (`Cannot find module '../src/middleware/authorize'`).

- [ ] **Step 3: Implementar el middleware**

`backend/src/middleware/authorize.ts`:

```ts
/**
 * Middleware de autorización por rol. Asume que requireAuth ya corrió
 * (existe req.user). Define el bloqueo real de secciones.
 */
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../utils/http-error';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Permite solo si req.user.role está en `roles`; si no, 403. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized('Sesión no encontrada'));
    if (!roles.includes(req.user.role)) {
      return next(forbidden('No tienes permiso para esta sección'));
    }
    next();
  };
}

/**
 * Autorización sensible al método: GET/HEAD usan `read`; el resto usa `write`.
 * Sirve para datos de referencia (empresas, unidades) que el colaborador
 * necesita leer para poblar selectores pero no puede modificar.
 */
export function allowRoles(opts: { read: readonly string[]; write: readonly string[] }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized('Sesión no encontrada'));
    const allowed = READ_METHODS.has(req.method) ? opts.read : opts.write;
    if (!allowed.includes(req.user.role)) {
      return next(forbidden('No tienes permiso para esta acción'));
    }
    next();
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- authorize`
Expected: PASS (todos los tests verdes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/authorize.ts backend/test/authorize.test.ts
git commit -m "feat(back): middleware de autorización requireRole/allowRoles con tests"
```

---

### Task 3: Cablear autorización en las rutas

**Files:**
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Aplicar los 3 niveles de autorización**

En `backend/src/routes/index.ts`, agrega los imports:

```ts
import { requireRole, allowRoles } from '../middleware/authorize';
import { ADMIN_ROLES, ALL_ROLES } from '../modules/shared/roles';
```

**Elimina** las líneas actuales del bloque "Módulos de negocio (protegidos)" (las `apiRouter.use('/x', requireAuth, xRouter)`, hoy líneas ~37-53) y **reemplázalas** por lo siguiente (no las dupliques ni las agregues debajo):

```ts
// Compartidas (admin + colaborador): acceso total a Proyectos y Tareas.
apiRouter.use('/projects', requireAuth, requireRole(...ALL_ROLES), projectsRouter);
apiRouter.use('/tasks', requireAuth, requireRole(...ALL_ROLES), tasksRouter);

// Datos de referencia: colaborador puede LEER (para selectores), no escribir.
const referenceAccess = allowRoles({ read: ALL_ROLES, write: ADMIN_ROLES });
apiRouter.use('/organizations', requireAuth, referenceAccess, organizationsRouter);
apiRouter.use('/business-units', requireAuth, referenceAccess, businessUnitsRouter);

// Solo admin (CEO/ADMIN): todo lo demás.
const adminOnly = requireRole(...ADMIN_ROLES);
apiRouter.use('/sales', requireAuth, adminOnly, salesRouter);
apiRouter.use('/income', requireAuth, adminOnly, incomeRouter);
apiRouter.use('/expenses', requireAuth, adminOnly, expensesRouter);
apiRouter.use('/finance', requireAuth, adminOnly, financeRouter);
apiRouter.use('/finance/imports', requireAuth, adminOnly, financeImportsRouter);
apiRouter.use('/finance/categories', requireAuth, adminOnly, financeCategoriesRouter);
apiRouter.use('/finance/category-rules', requireAuth, adminOnly, financeCategoryRulesRouter);
apiRouter.use('/clients', requireAuth, adminOnly, clientsRouter);
apiRouter.use('/vendors', requireAuth, adminOnly, vendorsRouter);
apiRouter.use('/documents', requireAuth, adminOnly, documentsRouter);
apiRouter.use('/decisions', requireAuth, adminOnly, decisionsRouter);
apiRouter.use('/agent', requireAuth, adminOnly, agentRouter);
apiRouter.use('/dashboard', requireAuth, adminOnly, dashboardRouter);
```

> El router `/users` se monta en el Chunk 2 (también con `adminOnly`).

- [ ] **Step 2: Verificar compilación**

Run: `npm run build`
Expected: sin errores.

- [ ] **Step 3: Verificación manual (bloqueo real)**

Con backend corriendo (`npm run dev`) y BD sembrada. Login como CEO y como colaborador (tras el seed del Chunk 2) y prueba con `curl`/navegador:
- CEO: `GET /api/finance/...` → 200.
- Colaborador: `GET /api/finance/...` → 403; `GET /api/projects` → 200; `GET /api/organizations` → 200; `POST /api/organizations` → 403.

(Esta verificación completa se hace al final; aquí basta con que compile.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/index.ts
git commit -m "feat(back): gating de rutas por rol (total / solo-lectura / 403)"
```

---

## Chunk 2: Backend — módulo de usuarios

### Task 4: Schema Zod de usuarios

**Files:**
- Create: `backend/src/modules/users/users.schema.ts`

- [ ] **Step 1: Escribir el schema**

`backend/src/modules/users/users.schema.ts`:

```ts
import { z } from 'zod';

// Email normalizado (trim + minúsculas) para evitar duplicados por mayúsculas.
const email = z.string().trim().toLowerCase().email('Correo inválido');
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres');
// El rol CEO no es asignable desde la API (es único, del dueño).
const assignableRole = z.enum(['ADMIN', 'COLABORADOR']);

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  email,
  role: assignableRole,
  password,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: assignableRole.optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

- [ ] **Step 2: Verificar compilación**

Run: `npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/users/users.schema.ts
git commit -m "feat(back): schema Zod de usuarios (create/update)"
```

---

### Task 5: Service de usuarios (TDD)

**Files:**
- Modify: `backend/test/db.ts` (agregar `"users"` al TRUNCATE)
- Modify: `backend/test/fixtures.ts` (fixture `makeUser`)
- Create: `backend/test/users.service.test.ts`
- Create: `backend/src/modules/users/users.service.ts`

- [ ] **Step 1: Aislar la tabla `users` entre tests**

En `backend/test/db.ts`, agrega `"users"` a la lista de `TRUNCATE`:

```ts
    TRUNCATE TABLE
      "users",
      "income_records", "expense_records", "clients", "vendors",
      "bank_transactions", "bank_accounts", "financial_import_batches",
      "organizations", "business_units", "projects"
    RESTART IDENTITY CASCADE
```

- [ ] **Step 2: Agregar el fixture `makeUser`**

En `backend/test/fixtures.ts`, al final:

```ts
export async function makeUser(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      name: 'Usuario Test',
      email: `user-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'hash-test',
      role: 'ADMIN',
      ...overrides,
    } as Prisma.UserUncheckedCreateInput,
  });
}
```

- [ ] **Step 3: Escribir los tests que fallan**

`backend/test/users.service.test.ts`:

```ts
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import { verifyPassword } from '../src/utils/password';
import * as users from '../src/modules/users/users.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('users.createUser', () => {
  test('crea con hash y sin exponer passwordHash', async () => {
    const u = await users.createUser({ name: 'Ana', email: 'ana@vitam.tech', role: 'COLABORADOR', password: 'secreta123' });
    expect(u).not.toHaveProperty('passwordHash');
    expect(u.role).toBe('COLABORADOR');
    const stored = await import('../src/lib/prisma').then((m) => m.prisma.user.findUnique({ where: { id: u.id } }));
    expect(stored!.passwordHash).not.toBe('secreta123');
    expect(await verifyPassword('secreta123', stored!.passwordHash)).toBe(true);
  });

  test('email duplicado => badRequest (400)', async () => {
    await users.createUser({ name: 'Ana', email: 'dup@vitam.tech', role: 'ADMIN', password: 'secreta123' });
    await expect(
      users.createUser({ name: 'Otra', email: 'dup@vitam.tech', role: 'ADMIN', password: 'secreta123' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('users.listUsers', () => {
  test('nunca devuelve passwordHash', async () => {
    await makeUser();
    const list = await users.listUsers();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('passwordHash');
  });
});

describe('users.updateUser — reglas de seguridad', () => {
  test('protege al CEO: no se puede desactivar', async () => {
    const ceo = await makeUser({ role: 'CEO', email: 'ceo@t.local' });
    const admin = await makeUser({ role: 'ADMIN', email: 'admin@t.local' });
    await expect(
      users.updateUser(ceo.id, { isActive: false }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('protege al CEO: no se puede degradar de rol', async () => {
    const ceo = await makeUser({ role: 'CEO', email: 'ceo2@t.local' });
    const admin = await makeUser({ role: 'ADMIN', email: 'admin2@t.local' });
    await expect(
      users.updateUser(ceo.id, { role: 'COLABORADOR' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('anti-auto-bloqueo: no puedes desactivarte a ti mismo', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'self@t.local' });
    await expect(
      users.updateUser(admin.id, { isActive: false }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('anti-auto-bloqueo: no puedes quitarte tu propio rol admin', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'self2@t.local' });
    await expect(
      users.updateUser(admin.id, { role: 'COLABORADOR' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('actualiza nombre/rol y resetea contraseña', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'a@t.local' });
    const target = await makeUser({ role: 'COLABORADOR', email: 'b@t.local' });
    const updated = await users.updateUser(target.id, { name: 'Beto', role: 'ADMIN', password: 'nuevaclave1' }, admin.id);
    expect(updated.name).toBe('Beto');
    expect(updated.role).toBe('ADMIN');
    const stored = await import('../src/lib/prisma').then((m) => m.prisma.user.findUnique({ where: { id: target.id } }));
    expect(await verifyPassword('nuevaclave1', stored!.passwordHash)).toBe(true);
  });

  test('desactiva un usuario (isActive=false)', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'a2@t.local' });
    const target = await makeUser({ role: 'COLABORADOR', email: 'c@t.local' });
    const updated = await users.updateUser(target.id, { isActive: false }, admin.id);
    expect(updated.isActive).toBe(false);
  });

  test('usuario inexistente => notFound (404)', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'a3@t.local' });
    await expect(
      users.updateUser('no-existe', { name: 'X' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 4: Correr los tests para verificar que fallan**

Run: `npm test -- users.service`
Expected: FAIL (`Cannot find module '../src/modules/users/users.service'`).

- [ ] **Step 5: Implementar el service**

`backend/src/modules/users/users.service.ts`:

```ts
/**
 * Lógica de negocio de usuarios. Único punto que escribe la tabla User.
 * Nunca devuelve passwordHash (select explícito). Errores vía http-error.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../utils/password';
import { badRequest, notFound } from '../../utils/http-error';
import type { CreateUserInput, UpdateUserInput } from './users.schema';

// Campos públicos: jamás incluye passwordHash.
const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function listUsers() {
  return prisma.user.findMany({ select: publicSelect, orderBy: { createdAt: 'asc' } });
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash },
      select: publicSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw badRequest('Ya existe un usuario con ese correo');
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput, currentUserId: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('Usuario no encontrado');

  // Proteger al CEO: no se puede desactivar ni cambiar su rol.
  if (target.role === 'CEO') {
    if (input.isActive === false) throw badRequest('No se puede desactivar al usuario CEO');
    if (input.role && input.role !== 'CEO') throw badRequest('No se puede cambiar el rol del usuario CEO');
  }

  // Anti-auto-bloqueo: no puedes desactivarte ni degradarte a ti mismo.
  if (id === currentUserId) {
    if (input.isActive === false) throw badRequest('No puedes desactivar tu propia cuenta');
    if (input.role === 'COLABORADOR') throw badRequest('No puedes quitarte tu propio acceso de administrador');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);

  return prisma.user.update({ where: { id }, data, select: publicSelect });
}
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `npm test -- users.service`
Expected: PASS (todos verdes).

- [ ] **Step 7: Commit**

```bash
git add backend/test/db.ts backend/test/fixtures.ts backend/test/users.service.test.ts backend/src/modules/users/users.service.ts
git commit -m "feat(back): service de usuarios (CRUD, hash, protección CEO, anti-auto-bloqueo) con tests"
```

---

### Task 6: Controller, router y montaje de `/users`

**Files:**
- Create: `backend/src/modules/users/users.controller.ts`
- Create: `backend/src/modules/users/users.routes.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Escribir el controller**

`backend/src/modules/users/users.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { createUserSchema, updateUserSchema } from './users.schema';
import * as service from './users.service';

export async function listUsersController(_req: Request, res: Response) {
  res.json({ data: await service.listUsers() });
}

export async function createUserController(req: Request, res: Response) {
  const input = createUserSchema.parse(req.body);
  res.status(201).json({ data: await service.createUser(input) });
}

export async function updateUserController(req: Request, res: Response) {
  const input = updateUserSchema.parse(req.body);
  // requireAuth garantiza req.user; se pasa para las reglas anti-auto-bloqueo.
  res.json({ data: await service.updateUser(req.params.id, input, req.user!.id) });
}
```

- [ ] **Step 2: Escribir el router**

`backend/src/modules/users/users.routes.ts`:

```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  listUsersController,
  createUserController,
  updateUserController,
} from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', asyncHandler(listUsersController));
usersRouter.post('/', asyncHandler(createUserController));
usersRouter.patch('/:id', asyncHandler(updateUserController));
```

- [ ] **Step 3: Montar `/users` (solo admin)**

En `backend/src/routes/index.ts`, agrega el import:

```ts
import { usersRouter } from '../modules/users/users.routes';
```

Y móntalo junto al resto (usa el mismo `adminOnly` definido en Task 3):

```ts
apiRouter.use('/users', requireAuth, requireRole(...ADMIN_ROLES), usersRouter);
```

- [ ] **Step 4: Verificar compilación y suite completa**

Run: `npm run build && npm test`
Expected: build sin errores; todos los tests previos + `authorize` + `users.service` en verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/users/users.controller.ts backend/src/modules/users/users.routes.ts backend/src/routes/index.ts
git commit -m "feat(back): endpoints /users (list/create/update) solo admin"
```

---

### Task 7: Colaborador de prueba en el seed

**Files:**
- Modify: `backend/prisma/seed.ts` (función `seedUserAndConfig`)

- [ ] **Step 1: Sembrar un colaborador idempotente**

En `backend/prisma/seed.ts`, dentro de `seedUserAndConfig` (tras el upsert del CEO), agrega:

```ts
const COLLAB_EMAIL = process.env.SEED_COLLAB_EMAIL ?? 'colaborador@vitam.tech';
const COLLAB_PASSWORD = process.env.SEED_COLLAB_PASSWORD ?? 'Colaborador2026!';
const collabHash = await bcrypt.hash(COLLAB_PASSWORD, 12);
await prisma.user.upsert({
  where: { email: COLLAB_EMAIL },
  update: { name: 'Colaborador Demo', role: Role.COLABORADOR, isActive: true },
  create: {
    name: 'Colaborador Demo',
    email: COLLAB_EMAIL,
    passwordHash: collabHash,
    role: Role.COLABORADOR,
    isActive: true,
  },
});
```

Y en el `console.log` final del seed, añade una línea informando las credenciales del colaborador (junto a la del CEO):

```ts
console.log(`  Usuario Colaborador: ${COLLAB_EMAIL} / ${COLLAB_PASSWORD}`);
```

- [ ] **Step 2: Ejecutar el seed**

Run: `npm run prisma:seed`
Expected: "Seed completado." e imprime ambas credenciales (CEO y Colaborador).

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat(back): seed de colaborador de prueba (COLABORADOR)"
```

---

## Chunk 3: Frontend — gating y página de usuarios

> Verificación en todo el chunk: `npm run lint` (typecheck) desde `frontend/`. No hay tests de frontend.

### Task 8: Helper de permisos

**Files:**
- Create: `frontend/src/lib/permissions.ts`

- [ ] **Step 1: Escribir el helper**

`frontend/src/lib/permissions.ts`:

```ts
/**
 * Gating de UI por rol (fuente única para menú y rutas).
 * El backend es la autoridad real; esto solo evita mostrar lo que no aplica.
 */
export function isAdmin(role?: string): boolean {
  return role === 'CEO' || role === 'ADMIN';
}

// Rutas accesibles por el colaborador (todo lo demás es solo-admin).
export const COLLABORATOR_PATHS = ['/proyectos', '/tareas'];

/** ¿El rol puede acceder a esta ruta privada? */
export function canAccessPath(path: string, role?: string): boolean {
  if (isAdmin(role)) return true;
  return COLLABORATOR_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

/** Ruta de aterrizaje según rol (admin → dashboard; colaborador → proyectos). */
export function landingPath(role?: string): string {
  return isAdmin(role) ? '/' : '/proyectos';
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/permissions.ts
git commit -m "feat(front): helper de permisos (isAdmin, canAccessPath, landingPath)"
```

---

### Task 9: Menú lateral filtrado por rol + entrada Usuarios

**Files:**
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Agregar la entrada Usuarios al menú**

En `frontend/src/lib/nav.ts`, importa `UserCog` y agrega el item **antes** de "Configuración":

```ts
import {
  Bot, Building2, CheckSquare, FileText, FolderKanban, Gavel,
  LayoutDashboard, Settings, TrendingUp, Truck, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
```

```ts
  { label: 'IA Ejecutiva', path: '/ia', icon: Bot },
  { label: 'Usuarios', path: '/usuarios', icon: UserCog },
  { label: 'Configuración', path: '/configuracion', icon: Settings },
```

- [ ] **Step 2: Filtrar el menú por rol en el Sidebar**

En `frontend/src/components/layout/Sidebar.tsx`:

```ts
import { NavLink } from 'react-router-dom';
import { navItems } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { canAccessPath } from '@/lib/permissions';
```

Dentro del componente, antes del `return`, calcula los items visibles:

```ts
  const { user } = useAuth();
  const visibleItems = navItems.filter((item) => canAccessPath(item.path, user?.role));
```

Y en el `.map`, reemplaza `navItems.map(...)` por `visibleItems.map(...)`.

- [ ] **Step 3: Verificar typecheck**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/nav.ts frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(front): menú filtrado por rol + entrada Usuarios"
```

---

### Task 10: Wrapper RequireAdmin + reestructurar rutas

**Files:**
- Create: `frontend/src/routes/RequireAdmin.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Crear el wrapper RequireAdmin**

`frontend/src/routes/RequireAdmin.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { isAdmin, landingPath } from '@/lib/permissions';

/**
 * Envuelve las rutas solo-admin. Un colaborador que intente entrar
 * (por URL directa) es redirigido a su landing (/proyectos).
 * Va dentro de ProtectedRoute, así que ya hay sesión validada.
 */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!isAdmin(user?.role)) {
    return <Navigate to={landingPath(user?.role)} replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 2: Reestructurar App.tsx (compartidas vs. solo-admin)**

En `frontend/src/App.tsx`, agrega imports:

```ts
import { RequireAdmin } from '@/routes/RequireAdmin';
import { UsersPage } from '@/pages/users/UsersPage';
```

Reemplaza el contenido de `<Route element={<AppLayout />}>` por:

```tsx
        <Route element={<AppLayout />}>
          {/* Compartidas: admin + colaborador */}
          <Route path="/proyectos" element={<ProjectsPage />} />
          <Route path="/proyectos/:id" element={<ProjectDetailPage />} />
          <Route path="/tareas" element={<TasksPage />} />

          {/* Solo admin (CEO/ADMIN) */}
          <Route element={<RequireAdmin />}>
            <Route index element={<DashboardPage />} />
            <Route path="/empresas" element={<OrganizationsPage />} />
            <Route path="/empresas/:id" element={<OrganizationDetailPage />} />
            <Route path="/ventas" element={<SalesPage />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
            <Route path="/proveedores" element={<VendorsPage />} />
            <Route path="/proveedores/:id" element={<VendorDetailPage />} />
            <Route path="/finanzas" element={<FinancePage />} />
            <Route path="/documentos" element={<DocumentsPage />} />
            <Route path="/decisiones" element={<DecisionsPage />} />
            <Route path="/ia" element={<AgentPage />} />
            <Route path="/usuarios" element={<UsersPage />} />

            {placeholders.map((p) => (
              <Route
                key={p.path}
                path={p.path}
                element={
                  <PlaceholderPage title={p.title} description={p.description} />
                }
              />
            ))}
          </Route>
        </Route>
```

> La ruta `/configuracion` (placeholder) queda dentro de `RequireAdmin`, cumpliendo la regla del spec: toda ruta fuera de `COLLABORATOR_PATHS` es solo-admin. El catch-all `*` sigue redirigiendo a `/`, que para un colaborador rebota a `/proyectos` vía `RequireAdmin`.

- [ ] **Step 3: NO verificar/commit aún**

`App.tsx` ahora importa `UsersPage`, que se crea en Task 11; por eso `npm run lint` fallará hasta terminar Task 11. **No hagas commit en esta tarea**: los archivos de Task 10 (`RequireAdmin.tsx`, `App.tsx`) se commitean junto con los de Task 11 en su Step 5, una vez que el typecheck pasa. Procede directo a Task 11.

---

### Task 11: Hook de usuarios + página Usuarios

**Files:**
- Create: `frontend/src/hooks/useUsers.ts`
- Create: `frontend/src/pages/users/UserForm.tsx`
- Create: `frontend/src/pages/users/UsersPage.tsx`

- [ ] **Step 1: Hook de usuarios (React Query)**

`frontend/src/hooks/useUsers.ts` (sigue el patrón de `hooks/useProjects.ts`):

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'CEO' | 'ADMIN' | 'COLABORADOR';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const KEY = ['users'];

export function useUsers() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ data: AdminUser[] }>('/users').then((r) => r.data),
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/users/${payload.id}`, payload.data)
        : api.post('/users', payload.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

- [ ] **Step 2: Formulario de alta/edición**

`frontend/src/pages/users/UserForm.tsx`. Usa los componentes UI existentes (`@/components/ui/*`, como en `pages/projects/ProjectForm.tsx`). Campos:
- Alta: `name`, `email`, `role` (Select con opciones **Admin** / **Colaborador**), `password`.
- Edición: `name`, `role`, `isActive` (toggle activar/desactivar), y `password` opcional (dejar vacío = no cambia).

Al enviar, arma el payload y llama a `useSaveUser().mutateAsync({ id?, data })`. En edición, no envíes `password` si está vacío. Muestra el error de `ApiError` (mensaje del backend, p. ej. "Ya existe un usuario con ese correo"). Respeta las reglas en la UI: si la fila editada es el propio usuario o un CEO, deshabilita desactivar/degradar (pero el backend es la autoridad).

> Referencia de estilo de formulario/modal: `frontend/src/pages/projects/ProjectForm.tsx` (manejo de estado local, `useSave*`, cierre en `onSuccess`, botones de `@/components/ui/button`).

- [ ] **Step 3: Página de usuarios**

`frontend/src/pages/users/UsersPage.tsx`. Estructura (mira `pages/clients/*` o `pages/projects/ProjectsPage.tsx` para el patrón de `PageHeader` + tabla + estados de carga/error/vacío):
- `PageHeader` título "Usuarios", descripción "Gestión de accesos al sistema", acción "Nuevo usuario" (abre `UserForm` en modo alta).
- `useUsers()` para la lista; `Spinner`/`ErrorState`/`EmptyState` de `@/components/ui/feedback`.
- Tabla con columnas: Nombre, Correo, Rol (badge), Estado (Activo/Inactivo), Acciones (Editar → abre `UserForm` en modo edición).
- Reusa el patrón de tabla de `BanksTab`/`ProjectsPage` (Card + `overflow-x-auto`).

- [ ] **Step 4: Verificar typecheck y build**

Run: `npm run lint`
Expected: sin errores (ya con `UsersPage` existente, Task 10 también compila).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useUsers.ts frontend/src/pages/users/UserForm.tsx frontend/src/pages/users/UsersPage.tsx frontend/src/routes/RequireAdmin.tsx frontend/src/App.tsx
git commit -m "feat(front): hook y página de gestión de usuarios (/usuarios)"
```

---

### Task 12: Verificación end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Typecheck y build de ambos paquetes**

Run (backend): `npm run build && npm test`
Run (frontend): `npm run lint && npm run build`
Expected: todo verde.

- [ ] **Step 2: Smoke manual — admin (CEO)**

Con backend (`npm run dev`), frontend (`npm run dev`) y BD sembrada. Login `ceo@vitam.tech` / `VitamCore2026!`:
- El menú muestra todas las secciones + **Usuarios**.
- Abre `/usuarios`, crea un usuario colaborador nuevo (verifica que se lista) y edita uno (cambia nombre/rol).
- Verifica que NO puedes desactivarte a ti mismo ni desactivar al CEO (el backend responde 400; la UI muestra el mensaje).

- [ ] **Step 3: Smoke manual — colaborador**

Login `colaborador@vitam.tech` / `Colaborador2026!`:
- El menú muestra **solo** Proyectos y Tareas.
- Aterriza en `/proyectos` (no en el Dashboard).
- Escribe `/finanzas` en la URL → redirige a `/proyectos`.
- En Proyectos/Tareas puede crear/editar/borrar (los selectores de empresa/unidad se pueblan correctamente).
- En la pestaña de red del navegador: `GET /api/finance/...` responde 403; `GET /api/organizations` responde 200.

- [ ] **Step 4: Commit final (si hubo ajustes de smoke)**

```bash
git add -A
git commit -m "chore: verificación RBAC end-to-end"
```

---

## Notas de implementación

- **Migración del enum:** agregar un valor a un enum de Postgres es no destructivo. Tras `migrate dev`, corre `npm run test:db:setup` para aplicar la migración también a la BD de test antes de `npm test`.
- **Sin borrado físico de usuarios:** solo desactivación (`isActive=false`); `login`/`requireAuth` ya rechazan usuarios inactivos.
- **Fuente de verdad:** la seguridad vive en el backend (middleware + service). El frontend solo mejora la experiencia (oculta lo que no aplica). No confíes en el gating de UI para seguridad.
- **DRY:** el predicado "es admin" vive una vez por lado (`modules/shared/roles.ts` en backend, `lib/permissions.ts` en frontend). No lo repliques inline.
