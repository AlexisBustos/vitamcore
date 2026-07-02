# Diseño: Usuarios y control de acceso por rol (RBAC)

- **Fecha:** 2026-07-02
- **Estado:** Aprobado (diseño)
- **Enfoque elegido:** A — Permisos por rol, "grueso" (allowlist por sección)

## Contexto y problema

VitamCore nació monousuario (solo el CEO). Se necesita introducir **dos tipos de usuario**:

1. **Acceso total** — ve todo el sistema y además puede **crear usuarios**.
2. **Limitado** — solo accede a **Proyectos y Tareas** (ver y editar), nada más.

El estado actual del sistema de auth:

- Existe `model User` con campo `role` y enum `Role { CEO, ADMIN }`, pero **ambos roles son equivalentes**: no hay ninguna lógica de autorización.
- `middleware/auth.ts::requireAuth` solo verifica sesión (JWT en cookie httpOnly); no distingue rol. Cualquier usuario autenticado puede llamar a cualquier endpoint.
- **No existe CRUD de usuarios**: solo se crean por el `seed`.
- El frontend ya expone `user.role` en `AuthContext`, pero `ProtectedRoute` y `Sidebar` muestran todo a todos.

## Decisiones tomadas

1. **Bloqueo real** (backend + frontend), no cosmético. El backend rechaza (403) accesos prohibidos aunque el usuario manipule la URL o llame a la API directamente.
2. El usuario limitado ve **todos** los proyectos y tareas (de ambas empresas), sin filtrado por asignación. No se toca el modelo de datos.
3. El usuario limitado puede **ver y editar** dentro de Proyectos y Tareas (crear tareas, cambiar estados, editar proyectos) — acceso total incluyendo **borrar** proyectos y tareas (los botones de borrado y `useDeleteProject`/`useDeleteTask` ya existen en esas páginas).
4. Nombre del rol limitado: `COLABORADOR`.
5. El usuario **CEO está protegido**: no se puede desactivar ni degradar desde la UI.

## Dependencia técnica clave: datos de referencia

Las páginas de Proyectos y Tareas (y sus formularios) requieren **lectura** de datos que pertenecen a otros dominios, para poblar los selectores:

- `ProjectsPage` / `ProjectForm` → `useOrganizations()` (GET /organizations) y `useBusinessUnits()` (GET /business-units).
- `TasksPage` / `TaskForm` → `useOrganizations()`, `useProjects()`, `useBusinessUnits()`.

Por lo tanto el colaborador necesita **acceso de solo lectura** a `organizations` y `business-units` aunque no pueda gestionarlas. Esto define **tres niveles** de acceso (no dos).

## 1. Modelo de roles

Se amplía el enum existente `Role` con un tercer valor:

```prisma
enum Role {
  CEO          // dueño / super-usuario — acceso total
  ADMIN        // acceso total + gestión de usuarios
  COLABORADOR  // solo Proyectos y Tareas
}
```

- **Acceso total** = `CEO` o `ADMIN` (idénticos en permisos). `CEO` se reserva para el dueño y no se ofrece al crear usuarios.
- **Limitado** = `COLABORADOR`.
- Migración: solo agrega el valor `COLABORADOR` al enum. El usuario actual sigue siendo `CEO`; no requiere cambio de datos.

Helper compartido para no dispersar la definición de "quién es admin":

```ts
// modules/shared/roles.ts (o similar)
export const ADMIN_ROLES = ['CEO', 'ADMIN'] as const;
export const ALL_ROLES = ['CEO', 'ADMIN', 'COLABORADOR'] as const;
export function isAdminRole(role: string): boolean {
  return role === 'CEO' || role === 'ADMIN';
}
```

## 2. Backend — autorización real (3 niveles)

Nuevo `middleware/authorize.ts` y un helper `forbidden` (403) en `utils/http-error.ts` (hoy existen `notFound`, `badRequest`, `unauthorized`).

Dos factories declarativas:

```ts
// 403 si req.user.role no está en la lista.
export function requireRole(...roles: string[]): RequestHandler;

// GET/HEAD usan el set `read`; el resto de métodos usan `write`.
export function allowRoles(opts: { read: string[]; write: string[] }): RequestHandler;
```

Ambas asumen que `requireAuth` ya corrió (existe `req.user`). Si por alguna razón no hay `req.user`, responden 401 vía `unauthorized`.

Aplicación en `routes/index.ts` (los routers ya se montan aquí con `requireAuth`):

| Router | CEO / ADMIN | COLABORADOR | Middleware |
|--------|-------------|-------------|------------|
| `projects`, `tasks` | total | **total (leer + escribir)** | `requireRole(...ALL_ROLES)` |
| `organizations`, `business-units` | total | **solo GET** | `allowRoles({ read: ALL_ROLES, write: ADMIN_ROLES })` |
| `sales`, `income`, `expenses`, `finance`, `finance/imports`, `finance/categories`, `finance/category-rules`, `clients`, `vendors`, `documents`, `decisions`, `agent`, `dashboard` | total | **403** | `requireRole(...ADMIN_ROLES)` |
| `users` (nuevo) | total | **403** | `requireRole(...ADMIN_ROLES)` |

El orden por router queda `requireAuth, <autorización>, <router>`.

## 3. Backend — módulo de usuarios (nuevo)

Módulo `modules/users/` siguiendo el patrón de 4 archivos del proyecto:

- `users.routes.ts` — envuelve controllers en `asyncHandler`. Montado en `routes/index.ts` bajo `/users` con `requireAuth, requireRole(...ADMIN_ROLES)`.
- `users.controller.ts` — parsea con Zod (`.parse()`), responde `{ data }` / `{ ok: true }`.
- `users.service.ts` — lógica + Prisma; errores vía helpers de `http-error`. Traduce P2002 → `badRequest`.
- `users.schema.ts` — schemas Zod.

Endpoints:

- `GET /users` — lista usuarios. **Nunca** devuelve `passwordHash` (select explícito de `id, name, email, role, isActive, createdAt, updatedAt`).
- `POST /users` — crea usuario. Body: `{ name, email, role: 'ADMIN' | 'COLABORADOR', password }`. Hash con `hashPassword` de `utils/password` (bcrypt cost 12). Email duplicado (P2002) → `badRequest`. El schema **rechaza** `role: 'CEO'`.
- `PATCH /users/:id` — actualiza `name`, `role`, `isActive` y, opcionalmente, `password` (reset). Todos opcionales.

Sin borrado físico: se **desactiva** (`isActive = false`). `requireAuth` y `login` ya rechazan usuarios con `isActive=false`, así que un usuario desactivado queda sin acceso de inmediato.

Reglas de seguridad (en el service, con `req.user.id` pasado desde el controller):

- No puedes **desactivarte a ti mismo** ni **quitarte tu propio rol admin** (evita auto-bloqueo) → `badRequest`.
- El usuario con rol **CEO está protegido**: no se puede desactivar ni cambiar su rol vía `PATCH` → `badRequest`.
- `password` (create y reset) exige longitud mínima razonable (p. ej. 8) vía Zod.

Notas:
- `email` se normaliza (trim + lowercase) en el schema para evitar duplicados por mayúsculas.
- No se implementa borrado (`DELETE`) para no romper relaciones (p. ej. `AIConversation`) y mantener trazabilidad.

## 4. Frontend — gating + página de Usuarios

**Helpers de permisos** — `lib/permissions.ts`:

```ts
export function isAdmin(role?: string): boolean;      // CEO || ADMIN
// Rutas visibles/accesibles por rol.
const COLLABORATOR_PATHS = ['/proyectos', '/tareas'];
export function canAccessPath(path: string, role?: string): boolean;
export function landingPath(role?: string): string;   // admin → '/', colaborador → '/proyectos'
```

**Sidebar** (`components/layout/Sidebar.tsx` + `lib/nav.ts`):
- Se filtra `navItems` por rol usando `useAuth().user.role`.
- Colaborador ve solo **Proyectos** y **Tareas**.
- Admin ve todo + nueva entrada **Usuarios** (`/usuarios`, ícono `UserCog` o `ShieldCheck`, distinto del ícono `Users` de Clientes).

**Rutas** (`App.tsx`):
- Nuevo wrapper `RequireAdmin` (análogo a `ProtectedRoute`) que envuelve las rutas solo-admin; si `!isAdmin(role)`, redirige a `landingPath(role)` (`/proyectos`).
- Rutas solo-admin: `/` (Dashboard), `/empresas*`, `/ventas`, `/clientes*`, `/proveedores*`, `/finanzas`, `/documentos`, `/decisiones`, `/ia`, `/configuracion` (placeholder existente) y la nueva `/usuarios`.
- Rutas compartidas (sin `RequireAdmin`): `/proyectos*`, `/tareas`.
- **Regla:** toda ruta privada que no esté en `COLLABORATOR_PATHS` (`['/proyectos', '/tareas']`) debe ir envuelta en `RequireAdmin`. Esto cubre explícitamente `/configuracion`, que de otro modo un colaborador podría abrir por URL.
- El índice `/` para colaborador redirige a `/proyectos` (vía `RequireAdmin` sobre el Dashboard, o un `Navigate` condicional en el índice).

**Página Usuarios** (`pages/users/UsersPage.tsx`, admin):
- Tabla de usuarios (nombre, email, rol, estado activo/inactivo).
- Botón "Nuevo usuario" → formulario/modal (nombre, email, rol [Admin/Colaborador], contraseña).
- Acciones por fila: editar (nombre/rol), activar/desactivar, resetear contraseña.
- Datos vía hook nuevo `hooks/useUsers.ts` (queries + mutaciones que invalidan `['users']`), consumiendo `lib/api.ts` como el resto.
- Se respetan las reglas del backend en la UI (no ofrecer desactivar/degradar al propio usuario ni al CEO), pero **el backend es la fuente de verdad**.

## 5. Testing y verificación

**Backend (Vitest — encaja con la red de la Fase 0, BD `vitamcore_test`):**

- Tests de acceso por rol (a través del router real):
  - Colaborador: `403` en `finance`, `sales`, `clients`, `users`; `200` en `GET /projects`, `GET /tasks`, `POST /tasks`, `GET /organizations`, `GET /business-units`; `403` en `POST /organizations`.
  - Admin/CEO: `200` en los mismos casos representativos.
- Tests del service de usuarios: creación (hash correcto, sin exponer `passwordHash`), email duplicado → `badRequest`, protección del CEO (no desactivar/degradar), no auto-desactivación, reset de password.

**Frontend:** `npm run lint` (typecheck) + smoke manual: login como colaborador (ve solo 2 secciones, `/finanzas` redirige) y como admin (ve todo + crea un colaborador desde `/usuarios`).

**Seed:** se agrega un colaborador de prueba idempotente (`colaborador@vitam.tech`, password conocido) para probar ambos tipos de inmediato tras `prisma:seed`.

## Componentes y sus límites (isolation)

- `middleware/authorize.ts` — decide acceso a partir de `req.user.role`. Entrada: request con `req.user`. Salida: `next()` o error 401/403. No conoce dominios.
- `modules/shared/roles.ts` — única fuente de la definición de roles y de "quién es admin". Consumido por backend (middleware, service) y espejado en `frontend/lib/permissions.ts`.
- `modules/users/*` — CRUD de usuarios; único punto que escribe `User`. No conoce Express salvo el controller.
- `frontend/lib/permissions.ts` — única fuente de gating de UI (nav + rutas). Consumido por `Sidebar`, `App` (`RequireAdmin`) y `UsersPage`.

## Fuera de alcance (YAGNI)

- Permisos granulares por capability (Enfoque B).
- Asignación usuario ↔ proyecto/tarea y filtrado por fila (Enfoque C).
- Rol de solo-lectura.
- Auto-registro, recuperación de contraseña por email, 2FA.
- Borrado físico de usuarios.
