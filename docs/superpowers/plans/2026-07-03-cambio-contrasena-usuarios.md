# Cambio de contraseña de usuarios — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada usuario cambie su propia contraseña (self-service con clave actual) y forzar el cambio en el primer ingreso cuando un admin crea/resetea la clave.

**Architecture:** Backend Express+Prisma: flag `mustChangePassword` en `User`, un endpoint `POST /api/auth/change-password` con dos modos (voluntario exige la actual; forzado no) y `createUser`/`updateUser` activan el flag. Frontend React: `AuthContext` gana `refresh()` y expone el flag; una pantalla forzada `/cambiar-clave` (fuera de `AppLayout`) con gate, y un modal voluntario desde el `Header`.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, Vitest, React + React Router + TanStack Query. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-07-03-cambio-contrasena-usuarios-design.md`

**Verificación global:** backend `npm run build` + `npm test`; frontend `npm run lint` + `npm run build`. Rama de trabajo: `develop`.

---

## Mapa de archivos

**Backend — crear:**
- `backend/prisma/migrations/20260703160000_must_change_password/migration.sql` — ALTER aditivo.
- `backend/test/change-password.service.test.ts` — tests del service + schema.

**Backend — modificar:**
- `backend/prisma/schema.prisma` — campo `mustChangePassword` en `User`.
- `backend/src/middleware/auth.ts` — `AuthUser` + `select` + `req.user` con el flag.
- `backend/src/modules/auth/auth.schema.ts` — `changePasswordSchema`.
- `backend/src/modules/auth/auth.service.ts` — `changePassword()` + flag en `login`.
- `backend/src/modules/auth/auth.controller.ts` — `changePasswordController`.
- `backend/src/modules/auth/auth.routes.ts` — ruta `POST /change-password`.
- `backend/src/modules/users/users.service.ts` — `createUser`/`updateUser` activan el flag.
- `backend/test/users.service.test.ts` — 2 casos del flag.

**Frontend — crear:**
- `frontend/src/hooks/useChangePassword.ts` — mutation.
- `frontend/src/pages/ChangePasswordPage.tsx` — pantalla forzada (solo nueva + confirmación).
- `frontend/src/components/ChangePasswordModal.tsx` — modal voluntario (actual + nueva + confirmación).

**Frontend — modificar:**
- `frontend/src/context/AuthContext.tsx` — `User.mustChangePassword` + `refresh()`.
- `frontend/src/App.tsx` — ruta `/cambiar-clave` hermana de `AppLayout`.
- `frontend/src/components/layout/AppLayout.tsx` — gate (redirect si flag).
- `frontend/src/components/layout/Header.tsx` — acción "Cambiar contraseña" + monta el modal.

---

## Chunk 1: Backend — modelo, migración y lógica

### Task 1: Flag `mustChangePassword` en el schema + migración

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260703160000_must_change_password/migration.sql`

- [ ] **Step 1: Agregar el campo al modelo `User`**

En `model User`, tras la línea `isActive     Boolean  @default(true)`:
```prisma
  mustChangePassword Boolean @default(false)
```

- [ ] **Step 2: Validar el schema**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Escribir la migración** (aditiva, a mano + `migrate deploy` porque `migrate dev` es interactivo en este entorno)

`backend/prisma/migrations/20260703160000_must_change_password/migration.sql`:
```sql
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Aplicar a dev + regenerar cliente + aplicar a la BD de test**

Run: `cd backend && npx prisma migrate deploy && npm run prisma:generate && npm run test:db:setup`
Expected: aplica `20260703160000_must_change_password` a dev y `vitamcore_test`; cliente regenerado.

- [ ] **Step 5: Verificar la columna**

Run: `docker exec vitamcore-postgres psql -U postgres -d vitamcore -c "\d users" | grep mustChangePassword`
Expected: aparece `mustChangePassword | boolean | not null | false`.

- [ ] **Step 6: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(back): flag mustChangePassword en User + migración"
```

### Task 2: `changePasswordSchema` (Zod)

**Files:**
- Modify: `backend/src/modules/auth/auth.schema.ts`
- Test: `backend/test/change-password.service.test.ts` (solo la parte de schema por ahora)

- [ ] **Step 1: Escribir el test que falla** — crear `backend/test/change-password.service.test.ts` con SOLO los tests de schema (los de service se agregan en Task 4, Step 1):

```typescript
import { describe, expect, test } from 'vitest';
import { changePasswordSchema } from '../src/modules/auth/auth.schema';

describe('changePasswordSchema', () => {
  test('acepta newPassword de 8+ y currentPassword opcional', () => {
    expect(changePasswordSchema.parse({ newPassword: '12345678' })).toEqual({
      newPassword: '12345678',
    });
    expect(
      changePasswordSchema.parse({ currentPassword: 'x', newPassword: '12345678' }),
    ).toEqual({ currentPassword: 'x', newPassword: '12345678' });
  });

  test('rechaza newPassword de menos de 8', () => {
    expect(changePasswordSchema.safeParse({ newPassword: '1234567' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/change-password.service.test.ts`
Expected: FAIL — `changePasswordSchema` no existe.

- [ ] **Step 3: Implementar el schema** — añadir a `backend/src/modules/auth/auth.schema.ts`:

```typescript
export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `cd backend && npx vitest run test/change-password.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add backend/src/modules/auth/auth.schema.ts backend/test/change-password.service.test.ts
git commit -m "feat(back): changePasswordSchema (Zod)"
```

### Task 3: Exponer `mustChangePassword` en la sesión (middleware + login)

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`

> Sin test propio (no hay tests de `requireAuth`/`login` hoy). Se verifica con `npm run build` y, más adelante, con el smoke E2E. Este cambio es prerrequisito de `changePassword` (que lee el flag) y del gate del frontend.

- [ ] **Step 1: Ampliar `AuthUser` y la query en `middleware/auth.ts`**

En `interface AuthUser`, agregar el campo:
```typescript
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}
```
En el `select` de `prisma.user.findUnique` (dentro de `requireAuth`), agregar `mustChangePassword: true`:
```typescript
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
```
En la asignación `req.user = { ... }`, agregar el campo:
```typescript
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
```

- [ ] **Step 2: Incluir el flag en el `user` que devuelve `login`** (`auth.service.ts`)

En el `return` de `login`, agregar el campo (el `findUnique` ya trae el registro completo):
```typescript
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
```

- [ ] **Step 3: Compilar**

Run: `cd backend && npm run build`
Expected: sin errores (el tipo `AuthUser` ahora exige el campo; ambos puntos ya lo aportan).

- [ ] **Step 4: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add backend/src/middleware/auth.ts backend/src/modules/auth/auth.service.ts
git commit -m "feat(back): exponer mustChangePassword en req.user y en login"
```

### Task 4: Service `changePassword`

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Test: `backend/test/change-password.service.test.ts` (agregar bloque de integración)

- [ ] **Step 1: Añadir los tests de integración** — agregar al final de `backend/test/change-password.service.test.ts`. La cabecera de imports debe quedar así (añadir lo que falte junto al import existente del schema):

```typescript
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import { changePassword } from '../src/modules/auth/auth.service';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { prisma } from '../src/lib/prisma';
```

Y el bloque de tests:
```typescript
beforeEach(resetDb);
afterAll(disconnect);

describe('changePassword — integración', () => {
  test('voluntario: con la actual correcta cambia la clave y limpia el flag', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    const res = await changePassword(user.id, {
      currentPassword: 'actual123',
      newPassword: 'nueva1234',
    });
    expect(res.mustChangePassword).toBe(false);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword('nueva1234', db!.passwordHash)).toBe(true);
  });

  test('voluntario: con la actual incorrecta => 401', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    await expect(
      changePassword(user.id, { currentPassword: 'mala', newPassword: 'nueva1234' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('voluntario: sin la actual => 401', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    await expect(
      changePassword(user.id, { newPassword: 'nueva1234' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('forzado: sin la actual cambia y limpia el flag', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('temporal1'),
      mustChangePassword: true,
    });
    const res = await changePassword(user.id, { newPassword: 'nueva1234' });
    expect(res.mustChangePassword).toBe(false);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword('nueva1234', db!.passwordHash)).toBe(true);
  });

  test('rechaza que la nueva sea igual a la actual => 400', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    await expect(
      changePassword(user.id, { currentPassword: 'actual123', newPassword: 'actual123' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/change-password.service.test.ts`
Expected: FAIL — `changePassword` no existe.

- [ ] **Step 3: Implementar `changePassword`** en `backend/src/modules/auth/auth.service.ts`. Asegurar los imports al inicio del archivo:
```typescript
import { hashPassword, verifyPassword } from '../../utils/password';
import { badRequest, unauthorized } from '../../utils/http-error';
```
> `verifyPassword` y `unauthorized` ya están importados; agregar `hashPassword` y `badRequest`.

Añadir la función y su tipo de entrada:
```typescript
import type { ChangePasswordInput, LoginInput } from './auth.schema';

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw unauthorized('Sesión inválida');

  // Modo voluntario: exige y verifica la contraseña actual.
  // Modo forzado (mustChangePassword): no la pide (ya se autenticó al entrar).
  if (!user.mustChangePassword) {
    if (!input.currentPassword) throw unauthorized('Contraseña actual incorrecta');
    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) throw unauthorized('Contraseña actual incorrecta');
  }

  // La nueva debe ser distinta de la actual.
  const same = await verifyPassword(input.newPassword, user.passwordHash);
  if (same) throw badRequest('La nueva contraseña debe ser distinta de la actual');

  const passwordHash = await hashPassword(input.newPassword);
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      mustChangePassword: true,
    },
  });
}
```

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `cd backend && npx vitest run test/change-password.service.test.ts`
Expected: PASS (7 tests: 2 de schema + 5 de integración).

- [ ] **Step 5: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add backend/src/modules/auth/auth.service.ts backend/test/change-password.service.test.ts
git commit -m "feat(back): service changePassword (voluntario/forzado + validaciones)"
```

### Task 5: Endpoint `POST /api/auth/change-password`

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`

> Sin test de ruta (no hay tests de controllers en el repo); se cubre con `npm run build` y el smoke E2E final.

- [ ] **Step 1: Controller** — añadir a `backend/src/modules/auth/auth.controller.ts`:

En los imports del schema, agregar `changePasswordSchema`:
```typescript
import { changePasswordSchema, loginSchema } from './auth.schema';
```
Y el controller:
```typescript
export async function changePasswordController(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  const user = await authService.changePassword(req.user!.id, input);
  res.json({ user });
}
```

- [ ] **Step 2: Ruta** — en `backend/src/modules/auth/auth.routes.ts`, importar el controller y montar la ruta con `requireAuth`:
```typescript
import {
  changePasswordController,
  loginController,
  logoutController,
  meController,
} from './auth.controller';
// ...
authRouter.post('/change-password', requireAuth, asyncHandler(changePasswordController));
```

- [ ] **Step 3: Compilar + suite completa**

Run: `cd backend && npm run build && npm test`
Expected: build limpio; toda la suite verde (incluye los 7 tests nuevos).

- [ ] **Step 4: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.routes.ts
git commit -m "feat(back): endpoint POST /auth/change-password"
```

### Task 6: `createUser`/`updateUser` activan el flag

**Files:**
- Modify: `backend/src/modules/users/users.service.ts`
- Test: `backend/test/users.service.test.ts`

- [ ] **Step 1: Añadir los tests que fallan** — agregar a `backend/test/users.service.test.ts` (dentro del `describe` existente; usa los mismos helpers del archivo):

```typescript
  test('createUser deja mustChangePassword=true', async () => {
    await createUser({
      name: 'Nuevo',
      email: 'nuevo@test.local',
      role: 'COLABORADOR',
      password: 'temporal1',
    });
    const db = await prisma.user.findUnique({ where: { email: 'nuevo@test.local' } });
    expect(db!.mustChangePassword).toBe(true);
  });

  test('updateUser con password (reset admin) deja mustChangePassword=true', async () => {
    const u = await makeUser({ mustChangePassword: false });
    await updateUser(u.id, { password: 'reseteada1' }, 'otro-admin-id');
    const db = await prisma.user.findUnique({ where: { id: u.id } });
    expect(db!.mustChangePassword).toBe(true);
  });
```
> Verificar que el archivo ya importe `createUser`, `updateUser`, `makeUser` y `prisma`; si falta alguno, agregarlo a los imports de la cabecera.

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `cd backend && npx vitest run test/users.service.test.ts`
Expected: FAIL — `mustChangePassword` queda en `false` (default).

- [ ] **Step 3: Implementar** en `backend/src/modules/users/users.service.ts`:

En `createUser`, agregar el flag al `data`:
```typescript
    return await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash,
        mustChangePassword: true,
      },
      select: publicSelect,
    });
```
En `updateUser`, dentro del bloque que setea la contraseña:
```typescript
  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
    data.mustChangePassword = true;
  }
```

- [ ] **Step 4: Ejecutar para verlo pasar + suite completa**

Run: `cd backend && npx vitest run test/users.service.test.ts && npm test`
Expected: PASS los 2 nuevos; suite completa verde.

- [ ] **Step 5: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add backend/src/modules/users/users.service.ts backend/test/users.service.test.ts
git commit -m "feat(back): createUser/updateUser activan mustChangePassword"
```

---

## Chunk 2: Frontend — contexto, pantalla forzada y modal

### Task 7: `AuthContext` — flag + `refresh()`

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`

- [ ] **Step 1: Agregar el flag al tipo `User`**
```typescript
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}
```

- [ ] **Step 2: Agregar `refresh` al contrato y a la implementación**

En `interface AuthContextValue`, agregar:
```typescript
  refresh: () => Promise<void>;
```
En `AuthProvider`, definir el método (reutiliza `/auth/me`):
```typescript
  const refresh = useCallback(async () => {
    const res = await api.get<{ user: User }>('/auth/me');
    setUser(res.user);
  }, []);
```
Y pasarlo en el `value`:
```typescript
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add frontend/src/context/AuthContext.tsx
git commit -m "feat(front): AuthContext expone refresh() y mustChangePassword"
```

### Task 8: Hook `useChangePassword`

**Files:**
- Create: `frontend/src/hooks/useChangePassword.ts`

- [ ] **Step 1: Crear el hook**
```typescript
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword: string;
}

/** Cambia la contraseña y refresca la sesión para actualizar el flag. */
export function useChangePassword() {
  const { refresh } = useAuth();
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      api.post('/auth/change-password', body),
    onSuccess: () => refresh(),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run lint` → PASS.
```bash
cd /c/Workspace/Code/vitamcore
git add frontend/src/hooks/useChangePassword.ts
git commit -m "feat(front): hook useChangePassword"
```

### Task 9: Pantalla forzada `/cambiar-clave` + gate + ruta

**Files:**
- Create: `frontend/src/pages/ChangePasswordPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Crear `ChangePasswordPage.tsx`** (pantalla completa, solo nueva + confirmación; estilo del `LoginPage`)
```typescript
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useChangePassword } from '@/hooks/useChangePassword';
import { landingPath } from '@/lib/permissions';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ChangePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const change = useChangePassword();
  const [nueva, setNueva] = useState('');
  const [confirma, setConfirma] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Esta pantalla es solo para el primer ingreso forzado. Si el usuario ya
  // no tiene el flag, no debe estar aquí.
  if (user && !user.mustChangePassword) {
    return <Navigate to={landingPath(user.role)} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (nueva !== confirma) return setError('Las contraseñas no coinciden.');
    try {
      await change.mutateAsync({ newPassword: nueva });
      navigate(landingPath(user?.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--color-foreground)]">
            Definí tu contraseña
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Por seguridad, elegí una contraseña nueva para continuar.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="nueva">Nueva contraseña</Label>
            <Input id="nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="confirma">Repetí la contraseña</Label>
            <Input id="confirma" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={change.isPending}>
            {change.isPending ? 'Guardando…' : 'Guardar y continuar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
```
> `landingPath(role?: string)` ya existe en `frontend/src/lib/permissions.ts` y tolera `undefined`.

- [ ] **Step 2: Montar la ruta en `App.tsx`** — hermana de `AppLayout`, dentro de `ProtectedRoute`. Añadir el import y la ruta:
```typescript
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
// ...
      <Route element={<ProtectedRoute />}>
        <Route path="/cambiar-clave" element={<ChangePasswordPage />} />
        <Route element={<AppLayout />}>
          {/* …resto sin cambios… */}
        </Route>
      </Route>
```

- [ ] **Step 3: Gate en `AppLayout.tsx`** — al inicio del componente, antes de renderizar el layout, redirigir si el flag está activo. Añadir imports (`Navigate` de react-router, `useAuth`) si faltan y:
```typescript
  const { user } = useAuth();
  if (user?.mustChangePassword) {
    return <Navigate to="/cambiar-clave" replace />;
  }
```
> Como `/cambiar-clave` está FUERA de `AppLayout`, el redirect no entra en bucle.

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add frontend/src/pages/ChangePasswordPage.tsx frontend/src/App.tsx frontend/src/components/layout/AppLayout.tsx
git commit -m "feat(front): pantalla forzada /cambiar-clave + gate en AppLayout"
```

### Task 10: Modal voluntario desde el `Header`

**Files:**
- Create: `frontend/src/components/ChangePasswordModal.tsx`
- Modify: `frontend/src/components/layout/Header.tsx`

- [ ] **Step 1: Crear `ChangePasswordModal.tsx`** (actual + nueva + confirmación, sobre el `Modal` existente)
```typescript
import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useChangePassword } from '@/hooks/useChangePassword';
import { ApiError } from '@/lib/api';

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useChangePassword();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirma, setConfirma] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setActual(''); setNueva(''); setConfirma(''); setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (nueva !== confirma) return setError('Las contraseñas no coinciden.');
    try {
      await change.mutateAsync({ currentPassword: actual, newPassword: nueva });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.');
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Cambiar contraseña">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <Label htmlFor="actual">Contraseña actual</Label>
          <Input id="actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus />
        </div>
        <div>
          <Label htmlFor="nueva">Nueva contraseña</Label>
          <Input id="nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="confirma">Repetí la nueva</Label>
          <Input id="confirma" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
            Cancelar
          </Button>
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? 'Guardando…' : 'Cambiar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```
> Verificar el layout interno del `Modal` (`components/ui/modal.tsx`): el `children` se renderiza en el cuerpo. Si el `Modal` ya aporta padding al cuerpo, quitar `p-5` del `form` para no duplicar.

- [ ] **Step 2: Añadir la acción en el `Header`** — importar el modal y un ícono, y agregar un botón que lo abra. En `Header.tsx`:
```typescript
import { KeyRound, LogOut, Menu } from 'lucide-react';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
```
Añadir estado `const [showPwd, setShowPwd] = useState(false);` y, junto al botón "Salir", un botón nuevo:
```tsx
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPwd(true)}
          title="Cambiar contraseña"
        >
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">Contraseña</span>
        </Button>
```
Y al final del JSX del header (antes del cierre), montar el modal:
```tsx
      <ChangePasswordModal open={showPwd} onClose={() => setShowPwd(false)} />
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/Workspace/Code/vitamcore
git add frontend/src/components/ChangePasswordModal.tsx frontend/src/components/layout/Header.tsx
git commit -m "feat(front): modal de cambio de contraseña en el Header"
```

---

## Verificación final (smoke E2E manual)

- [ ] Backend `npm run build` + `npm test` verdes; frontend `npm run lint` + `npm run build` verdes.
- [ ] Repoblar dev si hace falta (`npm run prisma:seed` **no** — la BD real ya tiene tu usuario; usar la BD dev con tu CEO). Levantar backend + frontend.
- [ ] **Forzado**: como CEO, crear un usuario colaborador con clave temporal. Cerrar sesión, entrar con ese colaborador → debe caer en `/cambiar-clave` sin acceso al menú. Definir la nueva (2 veces) → entra al landing del rol. Confirmar que un segundo login ya NO fuerza el cambio.
- [ ] **Voluntario**: con cualquier usuario, botón "Contraseña" en el header → modal. Probar: actual incorrecta (muestra error 401), nueva < 8 (bloqueo del formulario), nueva == actual (error 400), y un cambio correcto (cierra modal; el siguiente login funciona con la nueva).
- [ ] **Reset admin**: como CEO, resetear la clave de un usuario desde `/usuarios` → ese usuario en su próximo login vuelve a ser forzado a cambiarla.

## Handoff a producción (cuando se apruebe en local)

Tras mergear a `main`: en el VPS, el `deploy.sh` corre `prisma migrate deploy`, que aplica
`20260703160000_must_change_password` automáticamente sin perder datos. No requiere pasos extra.
