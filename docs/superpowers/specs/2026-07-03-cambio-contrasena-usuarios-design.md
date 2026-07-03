# Cambio de contraseña de usuarios — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado (pendiente de plan de implementación)

## Objetivo

Permitir que cada usuario gestione su propia contraseña, cubriendo dos flujos:

1. **Self-service**: un usuario autenticado cambia su propia contraseña cuando
   quiere (ingresando la actual + la nueva).
2. **Forzar cambio al primer ingreso**: cuando un admin/CEO crea un usuario (o le
   restablece la clave), el usuario es obligado a definir una nueva contraseña la
   primera vez que entra, antes de poder usar el resto de la aplicación.

Contexto: hoy un admin ya puede fijar/resetear la clave de cualquier usuario desde
el panel de Usuarios (`updateUser` acepta `password`), pero **no existe** forma de
que un usuario cambie su propia clave. Este diseño cubre ese vacío.

## Alcance

- Nuevo endpoint autenticado de cambio de contraseña (un solo endpoint, dos modos).
- Flag `mustChangePassword` en el modelo `User`.
- Pantalla dedicada de primer ingreso + modal de cambio voluntario en el frontend.
- Validaciones de la nueva contraseña.

**Fuera de alcance** (posibles agregados futuros, no ahora):
- Invalidar sesiones abiertas en otros dispositivos al cambiar la clave (el JWT es
  stateless; el token viejo sigue válido hasta expirar, 7 días). Aceptable para una
  herramienta interna.
- Recuperación de contraseña por email ("olvidé mi contraseña" sin admin).
- Rate limiting del endpoint (no hay infraestructura de rate-limit instalada aún).
- Política de complejidad más allá del mínimo definido abajo.

## Modelo de datos

Agregar al modelo `User` (`backend/prisma/schema.prisma`):

```prisma
mustChangePassword Boolean @default(false)
```

Reglas del flag:
- Se **activa** (`true`) cuando un admin le pone la clave a un usuario: al **crearlo**
  (`createUser`) y al **restablecérsela** (`updateUser` con `password` presente).
- Se **desactiva** (`false`) cuando el propio usuario cambia su contraseña vía el
  endpoint de cambio.
- Migración aditiva. Los usuarios existentes (el CEO) quedan en `false` por el
  `@default(false)` → no se les fuerza ningún cambio.

Migración manual (patrón del proyecto: `migrate dev` es interactivo en este entorno):
`ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;`
Aplicar con `prisma migrate deploy` en dev y `test:db:setup` en la BD de test.

## Backend

### Endpoint
`POST /api/auth/change-password` (bajo `requireAuth`; el usuario surge de `req.user`).

Body (Zod, `auth.schema.ts`):
```
{ currentPassword?: string, newPassword: string }
```
`newPassword`: mínimo 8 caracteres. `currentPassword` opcional a nivel de schema
(la obligatoriedad real depende del modo y se resuelve en el service).

### Lógica del service (`auth.service.ts` → `changePassword`)
Recibe `userId` y `{ currentPassword, newPassword }`:
1. Carga el usuario (incluyendo `passwordHash` y `mustChangePassword`). Si no existe
   o está inactivo → `unauthorized`.
2. **Modo forzado** (`mustChangePassword === true`): no exige `currentPassword`
   (el usuario ya se autenticó con la clave temporal en el login).
   **Modo voluntario** (`mustChangePassword === false`): `currentPassword` es
   obligatorio; se verifica con `verifyPassword`. Si falta o no coincide →
   `unauthorized('Contraseña actual incorrecta')`.
3. Validar la nueva:
   - `newPassword.length >= 8` (ya cubierto por Zod, defensivo también aquí).
   - La nueva debe ser **distinta de la actual**: comparar `verifyPassword(newPassword, hash)`;
     si coincide → `badRequest('La nueva contraseña debe ser distinta de la actual')`.
4. Guardar: `passwordHash = hashPassword(newPassword)` y `mustChangePassword = false`.
5. Devolver el usuario público actualizado (sin `passwordHash`).

### Cambios en usuarios (`users.service.ts`)
- `createUser`: setear `mustChangePassword: true`.
- `updateUser`: cuando `input.password` está presente (reset por admin), setear
  también `mustChangePassword: true` en el mismo update.

### Exponer el flag en la sesión
- `login` (`auth.service.ts`) y `/auth/me` (`meController`) devuelven `mustChangePassword`
  dentro del `user`. Implica extender `AuthUser` (o el objeto de respuesta) con ese campo.
- El controller de login mantiene el mismo flujo de cookie; solo se agrega el campo
  al `user` devuelto.

## Frontend

### Tipos y contexto
- Extender el tipo del usuario autenticado con `mustChangePassword: boolean`.
- `AuthContext` expone el `user` con el flag y un método para refrescar la sesión
  (`/auth/me`) tras un cambio exitoso.

### Pantalla dedicada de primer ingreso — `/cambiar-clave`
- Vista a pantalla completa, **fuera de `AppLayout`** (sin menú lateral ni header).
- Solo pide **nueva contraseña + confirmación** (modo forzado).
- **Gate**: si `user.mustChangePassword === true` y la ruta actual no es
  `/cambiar-clave`, redirigir ahí y bloquear el acceso al resto de la app. Al éxito,
  el flag pasa a `false` y se libera la navegación (redirige al landing por rol).

### Modal de cambio voluntario (Header)
- Al hacer clic en el avatar/nombre del `Header`, un menú/acciones muestra
  "Cambiar contraseña" (junto a "Salir").
- Abre un modal que pide **actual + nueva + confirmación**.
- Al éxito, cierra el modal (la sesión sigue activa).

### Hook y validación
- Un único hook `useChangePassword` (mutation a `POST /auth/change-password`) usado
  por la pantalla y el modal. En `onSuccess` refresca la sesión (`/auth/me`) para
  actualizar el flag.
- Validación en el formulario: `nueva.length >= 8` y `nueva === confirmación`.
  Errores del backend (actual incorrecta, nueva igual a la actual) se muestran al usuario.

## Manejo de errores

- Contraseña actual incorrecta → 401, mensaje claro en el formulario.
- Nueva menor a 8 → 400 (Zod) / bloqueo en el formulario.
- Nueva igual a la actual → 400 con mensaje.
- El endpoint nunca devuelve `passwordHash` ni detalles internos.

## Pruebas

Tests del service en backend (Vitest + BD de test):
- Modo voluntario: cambia la clave con `currentPassword` correcta y limpia el flag.
- Modo voluntario: `currentPassword` incorrecta → 401.
- Modo forzado (`mustChangePassword=true`): cambia con solo `newPassword` y limpia el flag.
- Rechaza `newPassword` menor a 8.
- Rechaza `newPassword` igual a la actual.
- `createUser` deja `mustChangePassword=true`; el reset del admin también.

Verificación: `npm run build` + `npm test` (backend), `npm run lint` + `npm run build`
(frontend). Smoke E2E: crear usuario → login → forzado a cambiar → cambio voluntario.
