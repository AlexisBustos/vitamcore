# Módulo Proveedores (espejo de Clientes)

**Fecha:** 2026-06-26
**Estado:** Aprobado (diseño)
**Rama:** `feat/proveedores`
**Roadmap:** primer sub-proyecto de la consolidación de Finanzas.

## Objetivo

Hoy las ventas crean **clientes** (`Client` con RUT + `clientId` en cada factura), pero
las compras solo guardan `vendorName`/`sourceRut` sueltos en el gasto, sin entidad. Crear
el módulo **Proveedores** espejo de Clientes: entidad `Vendor`, creación automática al
importar compras, `vendorId` en cada gasto, y página Proveedores con su detalle (todos los
gastos de ese proveedor).

## Contexto: el patrón a reflejar (Clientes)

- `Client` (`schema.prisma`): `id, organizationId, rut, name, timestamps`, relación
  `incomes IncomeRecord[]`, `@@unique([organizationId, rut])`. Los acumulados NO se
  almacenan: se calculan agregando los `IncomeRecord` (`clients.service.ts → computeStats`).
- `finance-imports.service.ts → upsertClient(tx, organizationId, rut, name)` hace
  `tx.client.upsert` por `organizationId_rut`; la ruta de escritura de ventas calcula
  `clientId` y lo guarda en el `IncomeRecord`.
- Módulo `clients`: `GET /clients` (lista + stats), `GET /clients/:id` (cliente + incomes
  hasta 300 + stats). Frontend: `useClients`/`useClientDetail`, `ClientsPage`,
  `ClientDetailPage`, rutas `/clientes` y `/clientes/:id`, item de nav "Clientes".
- La ruta de escritura de compras (`finance-imports.service.ts`, bloque
  `PURCHASE_REPORT`) ya guarda `vendorName`, `sourceRut`, etc., pero **no** enlaza entidad.

## Decisiones de diseño

- **Backfill**: la migración crea proveedores desde los gastos ya importados y enlaza su
  `vendorId`, para que la página funcione de inmediato con los datos actuales.
- **Enlace en Cuentas por pagar**: la columna *Proveedor* enlaza al detalle.
- No se agrega columna Proveedor a la pestaña Gastos (fuera de alcance por ahora).
- Stats del proveedor adaptadas a gastos (sin notas de crédito ni `netAmount`).

## Backend

### 1. Modelo `Vendor` + `vendorId` en gastos (migración con backfill)

- En `schema.prisma`, nuevo modelo (espejo de `Client`):
  ```prisma
  /// Proveedor (razón social + RUT) consolidado por empresa.
  /// Se crea/actualiza automáticamente al importar reportes de compras.
  /// Los acumulados NO se almacenan: se calculan agregando sus ExpenseRecord.
  model Vendor {
    id             String   @id @default(cuid())
    organizationId String
    rut            String
    name           String
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt

    organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
    expenses     ExpenseRecord[]

    @@unique([organizationId, rut])
    @@index([organizationId])
    @@map("vendors")
  }
  ```
- En `ExpenseRecord`: agregar `vendorId String?`, la relación
  `vendor Vendor? @relation(fields: [vendorId], references: [id], onDelete: SetNull)`, y
  `@@index([vendorId])`.
- En `Organization`: agregar la relación inversa `vendors Vendor[]` (igual que `clients`).
- **Migración**: generar con `prisma migrate dev --name vendors --create-only`; el SQL
  generado crea la tabla `vendors`, la columna `vendorId`, índices y FK. **Anexar** el
  backfill al final:
  ```sql
  -- Crear proveedores a partir de gastos ya importados (uno por empresa+RUT).
  INSERT INTO "vendors" ("id", "organizationId", "rut", "name", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, e."organizationId", e."sourceRut",
         COALESCE(MAX(e."vendorName"), e."sourceRut"), now(), now()
  FROM "expense_records" e
  WHERE e."sourceRut" IS NOT NULL AND e."sourceRut" <> ''
  GROUP BY e."organizationId", e."sourceRut"
  ON CONFLICT ("organizationId", "rut") DO NOTHING;

  -- Enlazar cada gasto con su proveedor.
  UPDATE "expense_records" e
  SET "vendorId" = v."id"
  FROM "vendors" v
  WHERE v."organizationId" = e."organizationId"
    AND v."rut" = e."sourceRut"
    AND e."vendorId" IS NULL
    AND e."sourceRut" IS NOT NULL AND e."sourceRut" <> '';
  ```
  `gen_random_uuid()` es core en PostgreSQL 16. Los proveedores backfilled tendrán `id`
  con formato UUID (los que cree la app después serán `cuid`); ambos son `String` válidos.
- Aplicar (`prisma migrate deploy`) y regenerar el cliente (`prisma generate`).

### 2. Importación de compras crea proveedores (`finance-imports.service.ts`)

- Agregar `upsertVendor(tx, organizationId, rut, name)` espejo de `upsertClient`
  (`tx.vendor.upsert` por `organizationId_rut`).
- En el bloque `PURCHASE_REPORT`, antes de `tx.expenseRecord.create`, calcular:
  ```ts
  const vendorName = stringOrNull(row.data.vendorName);
  const rut = stringOrNull(row.data.sourceRut);
  const vendorId = rut
    ? await upsertVendor(tx, batch.organizationId, rut, vendorName)
    : null;
  ```
  y agregar `vendorId` al `data` del `create` (reusando `vendorName`/`rut` ya calculados).

### 3. Módulo `vendors` (espejo de `clients`)

- `vendors.schema.ts`: `listVendorsQuery` con `organizationId?` y `search?` (igual que
  `listClientsQuery`).
- `vendors.service.ts`:
  - `computeStats(expenses)` adaptado a gastos:
    - `totalSpent`: suma de `amount` con `status !== 'CANCELLED'`.
    - `paidAmount`: suma de `amount` con `paidDate != null` y `status !== 'CANCELLED'`.
    - `pendingAmount`: `totalSpent − paidAmount`.
    - `documentCount`: nº de gastos.
    - `lastDocumentDate`: máximo de `sourceIssueDate ?? expenseDate`.
  - `listVendors(filters)`: `findMany` por org + búsqueda (name/rut, insensitive),
    `include: { organization, expenses: { select: { amount, status, paidDate, sourceIssueDate, expenseDate } } }`, devuelve `{ ...vendor, stats }`.
  - `getVendor(id)`: `findUnique` con `expenses` (orderBy `sourceIssueDate desc`,
    `createdAt desc`, take 300) + `organization`; 404 si no existe; devuelve `{ ...vendor, stats }`.
- `vendors.controller.ts`: `listVendorsController`, `getVendorController` (espejo de clients).
- `vendors.routes.ts`: `GET /` y `GET /:id`.
- Montar `vendorsRouter` en `routes/index.ts`: `apiRouter.use('/vendors', requireAuth, vendorsRouter)`.

## Frontend

### 4. Tipos (`types/domain.ts`)
- `vendorId: string | null` en `ExpenseRecord`.
- `VendorStats { totalSpent, paidAmount, pendingAmount, documentCount, lastDocumentDate }`.
- `Vendor { id, organizationId, rut, name, createdAt, updatedAt, organization?, stats }`.
- `VendorDetail extends Vendor { expenses: ExpenseRecord[] }`.

### 5. Hooks (`hooks/useVendors.ts`, espejo de `useClients.ts`)
- `useVendors(filters)` → `GET /vendors`.
- `useVendorDetail(id)` → `GET /vendors/:id`.

### 5b. Invalidación de `['vendors']` (`hooks/useFinance.ts`)
Para que las stats del proveedor se refresquen en el lugar (igual que `['clients']`):
- En `invalidateFinance` agregar `qc.invalidateQueries({ queryKey: ['vendors'] })`
  (cubre el pago de gastos vía `useRegisterExpensePayment`, que ya lo usa).
- En `useConfirmFinanceImport`, donde hoy invalida `['clients']`, invalidar también
  `['vendors']` (para que importar compras refresque la lista de proveedores).

### 6. Páginas (espejo de Clientes)
- `pages/vendors/VendorsPage.tsx`: buscador + filtro de empresa + tarjetas de resumen
  (Proveedores, Total gastado, Pendiente) + tabla (Proveedor [name/rut] · Empresa ·
  Documentos · Total gastado · Pendiente · Último documento), filas clickeables a
  `/proveedores/:id` (con soporte de teclado, como en Clientes).
- `pages/vendors/VendorDetailPage.tsx`: enlace volver + cabecera (name · rut · empresa) +
  tarjetas de stats + tabla de gastos (Folio · Fecha [`sourceIssueDate ?? expenseDate`] ·
  Descripción · Monto · Estado). El **estado de pago** se deriva localmente (helper
  `estadoPago`): `CANCELLED`→Anulado, `paidDate`→Pagado, `dueDate<hoy` sin pago→Vencido,
  si no →Pendiente. Estados loading/error/empty.
  - **Solo lectura a propósito**: a diferencia de `ClientDetailPage` (que tiene "Marcar
    pagada"), el detalle de proveedor no incluye acción de pago — el pago de gastos se
    hace en la pestaña **Cuentas por pagar**, para no duplicar el flujo.

### 7. Rutas y navegación
- `App.tsx`: rutas `/proveedores` → `VendorsPage` y `/proveedores/:id` → `VendorDetailPage`
  (dentro del layout protegido).
- `lib/nav.ts`: item `{ label: 'Proveedores', path: '/proveedores', icon: Truck }`
  (importar `Truck` de lucide-react), junto a Clientes.

### 8. Enlace en Cuentas por pagar (`pages/finance/PayablesTab.tsx`)
- La celda Proveedor: si `r.vendorId`, `<Link to={\`/proveedores/${r.vendorId}\`}>` con el
  `vendorName`; si no, texto plano; sin nombre → "—".

## Archivos afectados

**Backend**: `schema.prisma`, `prisma/migrations/<ts>_vendors/migration.sql`,
`finance-imports.service.ts`, nuevos `vendors.{schema,service,controller,routes}.ts`,
`routes/index.ts`.

**Frontend**: `types/domain.ts`, nuevo `hooks/useVendors.ts`, `hooks/useFinance.ts`
(invalidación `['vendors']`), nuevos `pages/vendors/VendorsPage.tsx` y
`VendorDetailPage.tsx`, `App.tsx`, `lib/nav.ts`, `pages/finance/PayablesTab.tsx`.

## Manejo de errores y casos borde

- Gasto sin `sourceRut` → no genera proveedor; `vendorId` queda null (texto plano en la tabla).
- Proveedor inexistente → `GET /vendors/:id` responde 404 ("Proveedor no encontrado").
- Backfill idempotente: `ON CONFLICT DO NOTHING` + `WHERE vendorId IS NULL`.
- Stats con gastos anulados (`CANCELLED`): excluidos de `totalSpent`/`paidAmount`.
- Cap de 300 gastos en el detalle (suficiente para un proveedor; sin paginación, YAGNI).

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build`; migración aplicada y cliente regenerado.
- Frontend: `cd frontend && npm run build`.
- Manual:
  1. La página Proveedores lista proveedores con totales (datos backfilled).
  2. Abrir un proveedor muestra sus gastos y stats.
  3. En Cuentas por pagar, el proveedor enlaza a su detalle.
  4. Reimportar compras crea/actualiza proveedores y enlaza `vendorId`.
