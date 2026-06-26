# Gastos: pago manual a la par de ingresos (Cuentas por pagar)

**Fecha:** 2026-06-26
**Estado:** Aprobado (diseño)
**Rama:** `feat/gastos-pago-manual`

## Objetivo

Hoy la importación del libro de compras clasifica los gastos como *Pagado* o
*Pendiente* según la columna `PAGADO`. El paso a pagado **debe ser manual**, igual que
en ingresos. Llevamos los gastos a paridad con ingresos:

1. La importación deja de clasificar: todo gasto entra **PENDIENTE**.
2. Se repara el dato legacy (gastos marcados pagados por la importación → PENDIENTE).
3. Se agrega pago manual: campo `paidDate`, endpoint `registerPayment`, guard, y una
   nueva pestaña **"Cuentas por pagar"** (espejo de "Cuentas por cobrar") con botón
   "Marcar pagado" / "Revertir" y filtros de estado y mes.

## Contexto: qué existe hoy

- `ExpenseRecord` **no tiene `paidDate`** (ingresos sí). Estados: `PENDING`, `PAID`,
  `OVERDUE`, `CANCELLED`.
- **No hay** flujo de pago manual de gastos (ni `registerPayment`, ni botón). El único
  modo es editar el estado en el formulario.
- `finance-imports.parser.ts → parsePurchaseRows` fija
  `status: parsePaid(PAGADO) ? 'PAID' : 'PENDING'`. `parsePaid` solo se usa ahí.
- Datos actuales: 38 gastos importados — **20 quedaron PAID** (por `PAGADO=SI`), 18 PENDING.
- Los KPIs de gastos en `finance.service.ts` se basan en `status`
  (`EXPENSE_PENDING = ['PENDING','OVERDUE']`); **no hay KPI de "pagado"**. Al reparar los
  20 a PENDING, quedan correctamente contados como pendientes. Sin cambios de *código* de
  KPIs (el valor de `pendingExpense` sube por la suma de los 20 reparados; es el resultado
  esperado, no una regresión).
- Ingresos ya tienen el patrón a copiar: `registerPayment`, guard `normalizePaidStatus`,
  `listMonths`, `paymentState`, y `ReceivablesTab`.

## Decisiones de diseño

- **Paridad completa**: `paidDate` + botón Marcar pagado + guard + import como pendiente
  + reparación.
- El flujo de pago vive en una **nueva pestaña "Cuentas por pagar"** (espejo de Cuentas
  por cobrar), no en la pestaña Gastos.
- El estado de pago de gastos es **más simple** que el de ingresos: no hay notas de
  crédito ni `netAmount`.
- El filtro de mes de gastos opera sobre **`expenseDate`** (la fecha del documento).
- `MonthFilter` se **desacopla**: recibirá `months: string[]` por prop (hoy llama
  internamente a `useIncomeMonths`), para servir a ingresos y gastos.

## Estado de pago derivado (gastos)

Conjunto "por pagar": `status ∈ {PENDING, OVERDUE}` y `paidDate = null`.
- **cancelled** (Anulado): `status = CANCELLED`.
- **paid** (Pagado): `paidDate` no nulo y `status ≠ CANCELLED`.
- **overdue** (Vencido): por pagar y `dueDate < hoy`.
- **payable** (Por pagar): por pagar.

## Backend

### 1. Modelo + reparación (migración Prisma)

- En `schema.prisma`, modelo `ExpenseRecord`: agregar `paidDate DateTime?` y
  `@@index([paidDate])`.
- Generar la migración **sin aplicar** (`prisma migrate dev --name expense_paid_date
  --create-only`), luego **anexar** al `migration.sql` generado la reparación idempotente:
  ```sql
  -- Resetea gastos marcados pagados por la importación (el pago se registra a mano).
  UPDATE "expense_records"
  SET "status" = 'PENDING'
  WHERE "status" = 'PAID' AND "paidDate" IS NULL;
  ```
- Aplicar (`prisma migrate deploy`) y regenerar cliente (`prisma generate`).

### 2. Importación deja de clasificar (`finance-imports.parser.ts`)

- En `parsePurchaseRows`, cambiar `status: parsePaid(valueOf(row, 'PAGADO')) ? 'PAID' :
  'PENDING'` por `status: 'PENDING'`. El dato crudo sigue en `rawData`.
- Eliminar el helper `parsePaid` (queda sin uso) y su uso. Verificar que no quede
  ninguna otra referencia antes de borrarlo.

### 3. Pago manual y filtros (`expenses.service.ts`, `.schema.ts`, `.controller.ts`, `.routes.ts`)

Espejo del módulo de ingresos:

- `expenses.schema.ts`:
  - `listExpenseQuery`: agregar
    `paymentState: z.enum(['payable','overdue','paid','cancelled']).optional()` y
    `month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato de mes inválido (YYYY-MM)').optional()`.
  - Agregar `registerPaymentSchema = z.object({ paidDate: dateInput.nullable() })` y su
    tipo `RegisterPaymentInput` (`dateInput` ya está importado de `../shared/zod`).
- `expenses.service.ts`:
  - Constante `PAYABLE_STATUSES = ['PENDING','OVERDUE'] as const`.
  - Helper guard:
    ```ts
    function normalizePaidStatus<T extends { status?: string | null }>(
      input: T, paidDate: Date | null,
    ): T {
      if (input.status === 'PAID' && !paidDate) return { ...input, status: 'PENDING' };
      return input;
    }
    ```
  - `create`: `data: normalizePaidStatus(input, null)` (el schema no trae `paidDate`).
  - `update`: agregar `paidDate` al `select`; `data: normalizePaidStatus(input, current.paidDate)`.
  - `list`: aplicar `paymentState` y `month` (rango UTC sobre `expenseDate`):
    ```ts
    if (filters.paymentState === 'payable') {
      where.paidDate = null;
      where.status = { in: [...PAYABLE_STATUSES] };
    } else if (filters.paymentState === 'overdue') {
      where.paidDate = null;
      where.status = { in: [...PAYABLE_STATUSES] };
      where.dueDate = { lt: new Date() };
    } else if (filters.paymentState === 'paid') {
      where.paidDate = { not: null };
      where.status = { not: 'CANCELLED' };
    } else if (filters.paymentState === 'cancelled') {
      where.status = 'CANCELLED';
    }
    if (filters.month) {
      const [y, m] = filters.month.split('-').map(Number);
      where.expenseDate = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lt: new Date(Date.UTC(y, m, 1)),
      };
    }
    ```
  - `registerPayment(id, input)`:
    ```ts
    export async function registerPayment(id: string, input: RegisterPaymentInput) {
      const rec = await prisma.expenseRecord.findUnique({
        where: { id }, select: { id: true, status: true },
      });
      if (!rec) throw notFound('Gasto no encontrado');
      if (rec.status === 'CANCELLED') throw badRequest('Un gasto anulado no se paga');
      const paidDate = input.paidDate ?? null;
      return prisma.expenseRecord.update({
        where: { id },
        data: { paidDate, status: paidDate ? 'PAID' : 'PENDING' },
      });
    }
    ```
    (Importar `badRequest` además de `notFound`.)
  - `listMonths(organizationId?)`: `$queryRaw` con `Prisma.sql`/`Prisma.empty` sobre
    `expense_records`, columna `expenseDate`, igual patrón que ingresos; devuelve `string[]`.
- `expenses.controller.ts`: agregar `registerPaymentController` (parsea
  `registerPaymentSchema`) y `listMonthsController` (reusa
  `listExpenseQuery.pick({ organizationId: true })`).
- `expenses.routes.ts`: agregar
  `expensesRouter.get('/months', asyncHandler(listMonthsController))` y
  `expensesRouter.patch('/:id/payment', asyncHandler(registerPaymentController))`. La ruta
  `/months` debe ir **antes** de `/:id`, y `/:id/payment` **antes** de `/:id` (paridad con
  `income.routes.ts`).

## Frontend

### 4. Tipos y hooks

- `types/domain.ts`: agregar a `ExpenseRecord` los campos `paidDate: string | null` y
  `sourceFolio: string | null`. Este último ya lo devuelve el backend (`list` usa
  `include: refs`, sin `select`, así que vienen todos los escalares) pero el tipo no lo
  declaraba; `PayablesTab` lo necesita para la columna Folio.
- `hooks/useFinance.ts`:
  - Ampliar `FinanceFilters.paymentState` a
    `'receivable' | 'payable' | 'overdue' | 'paid' | 'cancelled'`.
  - `useRegisterExpensePayment()`: `PATCH /expenses/:id/payment` con `{ paidDate }`;
    `onSuccess` llama `invalidateFinance(qc)` (ya invalida `expenses`, `finance`,
    `income`, `dashboard`).
  - `useExpenseMonths(organizationId?)`: `GET /expenses/months`, queryKey
    `['expenses','months',org]`.

### 5. `MonthFilter` reutilizable (`components/MonthFilter.tsx`)

- Cambiar la firma a `{ months: string[]; value?: string; onChange }` y eliminar la
  llamada interna a `useIncomeMonths` (queda presentacional; `labelMes` y `MESES` se
  mantienen).
- Actualizar los consumidores existentes para pasar los meses:
  - `IncomeTab.tsx` y `ReceivablesTab.tsx`: `const { data: months = [] } =
    useIncomeMonths(organizationId);` y `<MonthFilter months={months} … />`.

### 6. Nueva pestaña "Cuentas por pagar" (`pages/finance/PayablesTab.tsx`)

Espejo de `ReceivablesTab.tsx`:
- Estados: `payable`→"Por pagar", `overdue`→"Vencidas", `paid`→"Pagadas",
  `cancelled`→"Anuladas" (default `payable`).
- `useExpenses({ organizationId, paymentState: estado, month })` +
  `useExpenseMonths(organizationId)` para el `MonthFilter`.
- Columnas: Proveedor (`vendorName`) · Folio (`sourceFolio`) · Emisión (`expenseDate`) ·
  Vence (`dueDate`) · Monto (`amount`) · Acción.
- Acción: si `paidDate` → "Revertir" (`registrar.mutate({ id, paidDate: null })`); si no
  → "Marcar pagado" (`paidDate: new Date().toLocaleDateString('en-CA')`, fecha local como
  en ingresos). `disabled` mientras `isPending`.
- Total = suma de `amount`. Estados de carga/error/vacío y guard de empresa como en
  `ReceivablesTab`.

### 7. Registrar la pestaña (`pages/finance/FinancePage.tsx`)

- Agregar `'payables'` al tipo `Tab` y a `TABS` ("Cuentas por pagar", junto a Gastos),
  e importar y montar `<PayablesTab organizationId={organizationId} />`.

## Archivos afectados

**Backend**
- `prisma/schema.prisma` — `paidDate` + índice en `ExpenseRecord`.
- `prisma/migrations/<ts>_expense_paid_date/migration.sql` — columna + reparación.
- `finance-imports.parser.ts` — `parsePurchaseRows` siempre PENDING; quitar `parsePaid`.
- `expenses.schema.ts`, `expenses.service.ts`, `expenses.controller.ts`,
  `expenses.routes.ts` — pago manual, filtros, meses.

**Frontend**
- `types/domain.ts` — `paidDate` y `sourceFolio` en `ExpenseRecord`.
- `hooks/useFinance.ts` — `paymentState` ampliado, `useRegisterExpensePayment`,
  `useExpenseMonths`.
- `components/MonthFilter.tsx` — prop `months`.
- `pages/finance/IncomeTab.tsx`, `pages/finance/ReceivablesTab.tsx` — pasar `months`.
- `pages/finance/PayablesTab.tsx` — nueva.
- `pages/finance/FinancePage.tsx` — pestaña nueva.

## Manejo de errores y casos borde

- `month`/`paymentState` inválidos → Zod 400 (no ocurre desde la UI).
- Marcar pagado en gasto `CANCELLED` → 400 ("Un gasto anulado no se paga").
- Reparación idempotente (re-ejecución sin efecto).
- Guard en `update`: si el gasto ya tiene `paidDate` y el form manda `status='PAID'`, se
  mantiene PAID; solo se degrada cuando no hay `paidDate`.
- Desfase UTC al marcar pagado: fecha local `'en-CA'` (igual que ingresos).
- `expenseDate` nulo → no aparece al filtrar por mes ni genera opción en el desplegable.

## Verificación

No hay framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build` (tsc) sin errores; migración aplicada y cliente
  regenerado.
- Frontend: `cd frontend && npm run build` sin errores.
- Manual:
  1. Los 20 gastos ya **no** aparecen como Pagado (ahora Pendiente) en Gastos.
  2. Una nueva importación de compras entra toda como Pendiente.
  3. En "Cuentas por pagar", filtrar por estado y por mes; "Marcar pagado" mueve el gasto
     a Pagadas y el botón pasa a "Revertir"; revertir lo regresa a Por pagar.
  4. Guardar un gasto con estado *Pagado* desde el formulario lo deja *Pendiente*.
