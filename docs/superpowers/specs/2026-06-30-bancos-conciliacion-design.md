# Conciliación bancaria (desde la factura)

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feat/bancos-conciliacion`
**Roadmap:** Sub-proyecto **C** de la consolidación de Finanzas (A evolución ✅ → B
categorización ✅ → **C conciliación** → D posición consolidada). Ver memoria
`finanzas-consolidacion-roadmap`.

## Objetivo

Saber **qué facturas/gastos están realmente pagados** cruzándolos con el movimiento bancario que
los pagó. Flujo **invoice-centric**: para cada factura/gasto sin pagar, el sistema sugiere
movimientos candidatos del banco (por monto y fecha); al confirmar, la factura queda **pagada con
la fecha real del movimiento** y enlazada a él. Es la base de "qué está pagado" que alimenta el
sub-proyecto D.

## Contexto: lo que ya existe (y por qué este enfoque)

- **Realidad de los datos**: 681 movimientos bancarios vs. solo **18 ingresos** y **38 gastos**
  (de los libros), todos sin pagar. Conciliar *los 681 movimientos* contra facturas rendiría
  poco; lo valioso es, para las facturas que sí existen, encontrar su pago. Por eso invoice-centric.
- **Flujo de pago actual**: `income.service.registerPayment(id, {paidDate})` y su espejo
  `expenses.service.registerPayment` fijan `paidDate` + `status` (`PATCH /income/:id/payment`,
  `PATCH /expenses/:id/payment`). El front (`ReceivablesTab`/`PayablesTab`) tiene un botón
  "Marcar pagada" que usa la fecha de hoy y "Revertir" que pasa `paidDate: null`.
- `IncomeRecord`/`ExpenseRecord` tienen `amount`, `netAmount` (solo income), `paidDate`,
  `status`, `incomeDate`/`expenseDate`, `dueDate`, `organizationId`. `BankTransaction` tiene
  `creditAmount`/`chargeAmount`, `transactionDate`, `description`, `organizationId`.
- `components/ui/modal.tsx` (`Modal` con `open/onClose/title/description/size`).
- Hooks: `useRegisterPayment`/`useRegisterExpensePayment` (`{id, paidDate}`), invalidan vía
  `invalidateFinance`.

## Decisiones de diseño

- **Invoice-centric**: se concilia desde la factura/gasto, no desde el movimiento.
- **Cardinalidad**: una factura se concilia con **un** movimiento; un movimiento puede cubrir
  **varias** facturas. → el FK va del lado de la factura (`paidByBankTransactionId`).
- **Reutilizar el flujo de pago**: extender `registerPayment` con un `bankTransactionId` opcional
  (no crear un endpoint de pago paralelo). Conciliar = "marcar pagada eligiendo el movimiento".
- **Siempre confirmas tú**: hay sugerencias automáticas, pero nada se concilia solo.
- **Fallback preservado**: se mantiene "marcar pagada sin movimiento" (fecha manual), el
  comportamiento de hoy.
- **YAGNI**: sin conciliación parcial/por cuotas (N:M), sin flujo desde el movimiento, sin
  matching masivo automático. Independiente de la categorización (B).

## Modelo de datos

- `IncomeRecord`: `paidByBankTransactionId String?` + relación
  `paidByBankTransaction BankTransaction? @relation("IncomePayments", fields: [paidByBankTransactionId], references: [id], onDelete: SetNull)` + `@@index([paidByBankTransactionId])`.
- `ExpenseRecord`: igual con `@relation("ExpensePayments", ...)`.
- `BankTransaction`: relaciones inversas `paidIncomes IncomeRecord[] @relation("IncomePayments")` y
  `paidExpenses ExpenseRecord[] @relation("ExpensePayments")`.
- Migración `prisma migrate dev --name reconciliation_link`: solo agrega columnas/índices (sin
  backfill; hoy nada está conciliado). Regenerar cliente.

## Motor de sugerencias (candidatos)

`listReconciliationCandidates({ recordType: 'income' | 'expense', recordId, search? })` en
`finance-imports.service.ts` (es el lado banco):

1. Cargar el registro:
   - income → `organizationId`, monto objetivo = `netAmount ?? amount`, fecha ref = `incomeDate ?? dueDate`.
   - expense → `organizationId`, monto objetivo = `amount`, fecha ref = `expenseDate ?? dueDate`.
   - 404 si no existe.
2. Traer movimientos candidatos con Prisma `findMany` (dataset chico, ranking en JS):
   - **Misma empresa** y **dirección correcta**: income → `creditAmount > 0`; expense → `chargeAmount > 0`.
   - Si viene `search`: filtrar además `description contains search (insensitive)` **o** monto
     que contenga el dígito (simplemente filtrar por descripción; el monto se ve en la lista).
   - `take: 100`, `orderBy: { transactionDate: 'desc' }`.
3. **Ranking en JS** y top 8:
   - `amount` del movimiento = `creditAmount` (income) / `chargeAmount` (expense).
   - `exact = (amount === objetivo)`.
   - Ordenar por `exact` desc, luego por `|transactionDate − fechaRef|` asc.
   - Devolver `{ id, transactionDate, description, amount, exact }[]` (top 8; si hay `search`,
     devolver hasta 20 sin recortar tanto, para el fallback manual).
- Endpoint: `GET /finance/imports/reconciliation/candidates?recordType=&recordId=&search=`
  (controller `reconciliationCandidatesController` + ruta en `finance-imports.routes.ts`).
- Schema Zod: `reconciliationCandidatesQuery = z.object({ recordType: z.enum(['income','expense']), recordId: z.string().min(1), search: z.string().trim().optional() })`.

## Conciliar / revertir (extensión del pago)

Extender **ambos** `registerPayment` (income y expenses) con `bankTransactionId` opcional.

- `registerPaymentSchema`: agregar `bankTransactionId: z.string().optional().nullable()`.
- Service (income; expenses espejo):
  - Si viene `bankTransactionId`: cargar el movimiento (`findUnique`), validar que existe, que es
    de la **misma empresa** que la factura (`badRequest` si no) y que tiene la **dirección
    correcta** (income → `creditAmount > 0`; expense → `chargeAmount > 0`; `badRequest` si no).
    Fijar `paidByBankTransactionId = movimiento.id`, `paidDate = movimiento.transactionDate`,
    `status = PAID`.
  - Si **no** viene `bankTransactionId`: comportamiento actual — `paidDate = input.paidDate ?? null`,
    `status = paidDate ? PAID : INVOICED/PENDING`, y **`paidByBankTransactionId = null`** (revertir
    o pago manual limpian el enlace).
  - Mantener las guardas actuales (NC no se cobra, factura anulada `netAmount===0` no se cobra).

## Frontend

### Tipos (`types/domain.ts`)
- `IncomeRecord`/`ExpenseRecord`: `paidByBankTransactionId: string | null`.
- `ReconciliationCandidate { id: string; transactionDate: string; description: string; amount: number; exact: boolean }`.

### Hooks (`hooks/useFinance.ts`)
- `useReconciliationCandidates({ recordType, recordId, search }, enabled)` →
  `GET /finance/imports/reconciliation/candidates`, key `['finance-imports','reconcile',...]`.
  `enabled` para no consultar hasta abrir el modal.
- Extender `useRegisterPayment`/`useRegisterExpensePayment` para aceptar
  `{ id, paidDate?, bankTransactionId? }` (siguen invalidando `invalidateFinance`; agregar
  invalidación de `['finance-imports']` para refrescar el saldo/uso del movimiento).

### Componente `ReconcileModal` (`pages/finance/ReconcileModal.tsx`, nuevo)
Reusado por ambas pestañas, parametrizado por `recordType`:
- Props: `open`, `onClose`, `recordType: 'income'|'expense'`, `record` (id, nombre, folio, monto,
  fecha), y la mutación de pago.
- Contenido: cabecera con datos de la factura; input de búsqueda (controla `search`); lista de
  candidatos (`useReconciliationCandidates`) — fecha · descripción · monto, badge **"calza
  exacto"** cuando `exact`; cada uno con botón **Conciliar** (`mutate({ id, bankTransactionId })`).
  Pie con **"Marcar pagada sin movimiento"** (`mutate({ id, paidDate: hoy-local })`, igual que hoy)
  y el estado loading/empty. Al éxito, cerrar el modal.

### Integración (`ReceivablesTab.tsx` y `PayablesTab.tsx`)
- La acción de cada fila **sin pagar** pasa de "Marcar pagada" a **"Conciliar"**, que abre el
  `ReconcileModal` para esa fila. Las filas **pagadas** mantienen "Revertir"
  (`mutate({ id, paidDate: null })`, que ahora también limpia el enlace).
- Estado local `reconciling: <record | null>` para saber qué fila tiene el modal abierto.

## Archivos afectados

**Backend**: `schema.prisma`, `prisma/migrations/<ts>_reconciliation_link/`,
`finance-imports.service.ts` (candidatos), `finance-imports.controller.ts`,
`finance-imports.routes.ts`, `finance-imports.schema.ts`,
`income.service.ts`, `income.schema.ts`, `expenses.service.ts`, `expenses.schema.ts`.

**Frontend**: `types/domain.ts`, `hooks/useFinance.ts`, nuevo `pages/finance/ReconcileModal.tsx`,
`pages/finance/ReceivablesTab.tsx`, `pages/finance/PayablesTab.tsx`.

## Manejo de errores y casos borde

- **Sin candidatos**: la lista queda vacía; el usuario usa la búsqueda o "marcar pagada sin
  movimiento".
- **Movimiento de otra empresa o dirección equivocada** en `registerPayment` → `badRequest`.
- **NC / factura anulada**: mantienen las guardas actuales (no se cobran).
- **Revertir**: `paidDate: null` sin `bankTransactionId` → limpia `paidDate`, `status` y
  `paidByBankTransactionId`.
- **Movimiento borrado**: `onDelete: SetNull` deja la factura pagada pero sin enlace (no rompe).
- **Un movimiento para varias facturas**: permitido (no se "consume"); la misma sugerencia puede
  aparecer para varias facturas. (Aceptado por diseño.)
- **Montos que no calzan exacto**: igual se sugieren (ordenados después de los exactos) y se
  pueden conciliar; el badge "calza exacto" distingue.

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build`; migración aplicada y cliente regenerado.
- Frontend: `cd frontend && npm run build`.
- Manual:
  1. En Cuentas por cobrar, una factura sin pagar abre el modal "Conciliar" con candidatos
     (abonos de la misma empresa), exactos primero con su badge.
  2. Conciliar fija la factura como pagada con la **fecha del movimiento** y la enlaza; aparece en
     el filtro "Pagadas".
  3. "Revertir" la devuelve a por cobrar y limpia el enlace.
  4. Igual en Cuentas por pagar con cargos.
  5. "Marcar pagada sin movimiento" sigue funcionando (fecha de hoy, sin enlace).
  6. La búsqueda en el modal permite elegir un movimiento que no salía en el top.
