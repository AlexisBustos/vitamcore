# Conciliación múltiple + búsqueda por nombre en Cuentas por cobrar/pagar

**Fecha:** 2026-07-08
**Estado:** aprobado (diseño validado con el CEO)
**Rama:** `develop` (trabajo local)

## Problema

En Finanzas, las pestañas **Cuentas por cobrar** (`ReceivablesTab`) y **Cuentas por
pagar** (`PayablesTab`) —ambas montadas sobre `LedgerTab`— hoy solo permiten:

- Filtrar por estado y por mes (no hay búsqueda por nombre de cliente/proveedor).
- Conciliar **una factura a la vez** contra un movimiento bancario (`ReconcileModal`
  + `registerPayment`).

En la operación real, una empresa suele pagar **varias facturas con una sola
transferencia**. Falta poder buscar por nombre y seleccionar varias facturas para
conciliarlas contra un único movimiento bancario. Mismo comportamiento en cobrar y pagar.

## Punto de partida (estado actual)

- **El esquema ya soporta N‑a‑1.** `IncomeRecord.paidByBankTransactionId` /
  `ExpenseRecord.paidByBankTransactionId` son FK al lado factura, y
  `BankTransaction` tiene las relaciones inversas de lista `paidIncomes[]` /
  `paidExpenses[]`. Varias facturas ya pueden apuntar a un mismo movimiento. El
  bloqueo es solo de **UI y servicio**, no de datos. No hay migración de BD.
- `registerPayment` (`income.service.ts:124`, `expenses.service.ts:116`) procesa
  una factura y acepta `{ paidDate }` (manual/revertir) o `{ bankTransactionId }`
  (conciliar con movimiento; fija `paidDate = mov.transactionDate`, `status=PAID`).
- Los listados `GET /income` y `GET /expenses` **no** aceptan búsqueda por nombre.
- `paymentState` usa `where.OR` (`RECEIVABLE_OR`) en el service: hay que combinar el
  search sin pisarlo.
- Candidatos de conciliación: `GET /reconciliation/candidates`
  (`finance-imports`) calcula el `target` desde una sola factura (`recordId`).

## Decisiones (acordadas)

1. **Calce de montos:** *avisar pero permitir*. El backend no bloquea por diferencia
   entre Σ facturas y monto del movimiento; la advertencia es visual en el frontend.
2. **Acciones masivas:** conciliar contra movimiento (principal) **+** marcar pagadas
   con fecha manual **+** revertir/desconciliar en masa.
3. **Enfoque:** partir desde la tabla (buscar → seleccionar → conciliar). Se descarta
   el flujo inverso desde el movimiento (posible mejora futura).

## Diseño

### Backend

#### 1. Búsqueda por nombre
Agregar `search?: string` a `listIncomeQuery` / `listExpenseQuery` (Zod). En el
service, cuando venga, filtrar con `contains` (mode `insensitive`) sobre:
- Income: `clientName`, `sourceFolio`, `sourceRut`.
- Expense: `vendorName`, `sourceFolio`, `sourceRut`.

**Cuidado con `paymentState`:** hoy setea `where.OR`. Reestructurar a
`where.AND = [{ OR: receivableOr }, { OR: searchOr }]` para que ambos convivan y no
se pise el cálculo de "saldo por cobrar". Search se compone con estado y mes.

#### 2. Endpoints bulk
Un endpoint por libro que refleja la forma del `registerPayment` actual:
- `POST /income/payments/bulk` — body `{ ids: string[], paidDate?, bankTransactionId? }`
- `POST /expenses/payments/bulk` — igual

| Acción | Body |
|---|---|
| Conciliar N ↔ 1 movimiento | `{ ids, bankTransactionId }` |
| Marcar N pagadas con fecha | `{ ids, paidDate }` |
| Revertir N | `{ ids, paidDate: null, bankTransactionId: null }` |

`bulkRegisterPayment(ids, input)`:
- Valida existencia y misma organización de todas las facturas; reusa guardas de
  `registerPayment` (income: NC no se cobra, `netAmount === 0` no se cobra).
- Si viene `bankTransactionId`: valida una vez que el movimiento exista, sea de la
  misma org y del signo correcto (abono income / cargo expense).
- Aplica en una sola `prisma.$transaction` (atómico). Devuelve `{ count }`.

#### 3. Candidatos por monto
Extender `listReconciliationCandidates` para aceptar, alternativamente,
`{ recordType, organizationId, amount }` (la suma seleccionada) cuando no hay
`recordId`. Backward-compatible con el flujo de una factura.

### Frontend

#### 1. Búsqueda en `LedgerTab`
Input de búsqueda ("Buscar por cliente/proveedor, folio o RUT…") con debounce
~300 ms, pasado como `search` al `listHook`. Añadir `search?: string` a
`FinanceFilters` (`finance-shared.ts`).

#### 2. Selección múltiple
- Checkbox por fila + "seleccionar todo" (filas visibles) en el header.
- Estado local `selected: Set<string>`.
- Barra de acciones flotante cuando hay selección: `N seleccionadas · Σ {monto}`.
- Botones según estado activo (la selección es homogénea porque la pestaña ya filtra
  por estado):
  - por cobrar/pagar/vencidas → **Conciliar con movimiento** · **Marcar pagadas**
  - pagadas → **Revertir**
- Al cambiar estado/mes/búsqueda se limpia la selección.

#### 3. Modal múltiple
Extender `ReconcileModal` para recibir un conjunto:
- Encabezado `N facturas · Σ {monto}`.
- Candidatos buscados por la suma. "Calza exacto" cuando movimiento == Σ; si no,
  advertencia ⚠ pero permite conciliar.
- Confirmar → `bulkRegisterPayment({ ids, bankTransactionId })`.
- "Marcar pagadas": date-picker → `bulkRegisterPayment({ ids, paidDate })`.
- "Revertir": confirmación → `bulkRegisterPayment({ ids, paidDate: null, bankTransactionId: null })`.

#### 4. Hooks
`useBulkRegisterPayment()` (income) + gemelo en expenses, invalidando el mismo grafo
que `useRegisterPayment` (`invalidateFinance` + `finance-imports`). Extender
`useReconciliationCandidates` con params opcionales `organizationId`/`amount`.

## Casos borde

- Atomicidad por `$transaction`.
- Org distinta → `badRequest`; ids inexistentes → `notFound`; `ids` mínimo 1 (Zod).
- Signo de movimiento validado una vez.
- NC / `netAmount === 0` en income → rechazo con mensaje claro.
- Conciliar con movimiento fija `paidDate = mov.transactionDate`.
- Sin paginación en la tabla → "seleccionar todo" = todas las filas filtradas.

## Alcance excluido

- Pagos parciales (status es binario PAID; una factura se salda completa).
- Flujo inverso desde el movimiento (Enfoque C).
- Persistir "monto conciliado" por par factura-movimiento.

## Testing

- Vitest (BD de test) para `bulkRegisterPayment` income/expenses: conciliar N↔1,
  marcar N, revertir N, y rechazos (org distinta, signo, NC). Filtro `search`:
  encontrar por nombre/folio/RUT y componer con `paymentState`.
- Frontend: typecheck (`npm run lint` / `npm run build`).
