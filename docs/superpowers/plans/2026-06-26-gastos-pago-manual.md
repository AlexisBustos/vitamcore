# Gastos: pago manual (Cuentas por pagar) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar los gastos a paridad con ingresos: el pago se registra a mano (no por la importación), con `paidDate`, guard, filtros y una nueva pestaña "Cuentas por pagar".

**Architecture:** Backend (Express + Prisma + Zod, módulo `expenses`) espejo del módulo `income`: campo `paidDate`, `registerPayment`, guard `normalizePaidStatus`, `paymentState`/`month` en el listado y `listMonths`. La importación de compras deja de clasificar. Frontend: hooks de pago/meses de gasto, `MonthFilter` desacoplado (recibe `months`), y `PayablesTab` espejo de `ReceivablesTab`.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, React, Vite, TanStack Query, React Router, Tailwind v4.

**Verificación:** Sin framework de tests. Backend `cd backend && npm run build` (tsc); frontend `cd frontend && npm run build` (tsc --noEmit && vite build); más prueba manual.

**Spec:** `docs/superpowers/specs/2026-06-26-gastos-pago-manual-design.md`

---

## File Structure

**Backend**
- `prisma/schema.prisma` — `paidDate` + índice en `ExpenseRecord`.
- `prisma/migrations/<ts>_expense_paid_date/migration.sql` — columna + reparación.
- `src/modules/finance-imports/finance-imports.parser.ts` — `parsePurchaseRows` PENDING; quitar `parsePaid`.
- `src/modules/expenses/expenses.schema.ts` — `paymentState`, `month`, `registerPaymentSchema`.
- `src/modules/expenses/expenses.service.ts` — filtros, `registerPayment`, `listMonths`, guard.
- `src/modules/expenses/expenses.controller.ts` — `registerPaymentController`, `listMonthsController`.
- `src/modules/expenses/expenses.routes.ts` — rutas `/months` y `/:id/payment` (antes de `/:id`).

**Frontend**
- `src/types/domain.ts` — `paidDate` + `sourceFolio` en `ExpenseRecord`.
- `src/hooks/useFinance.ts` — `paymentState` ampliado, `useRegisterExpensePayment`, `useExpenseMonths`.
- `src/components/MonthFilter.tsx` — prop `months` (desacoplar).
- `src/pages/finance/IncomeTab.tsx`, `ReceivablesTab.tsx` — pasar `months`.
- `src/pages/finance/PayablesTab.tsx` — nueva.
- `src/pages/finance/FinancePage.tsx` — pestaña nueva.

---

## Chunk 1: Backend

### Task 1: Campo `paidDate` en gastos + reparación

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelo `ExpenseRecord`)
- Create: `backend/prisma/migrations/<ts>_expense_paid_date/migration.sql` (generado + editado)

- [ ] **Step 1: Agregar el campo y el índice al schema**

En `schema.prisma`, modelo `ExpenseRecord`, agrega `paidDate` justo después de la línea
`status ... @default(PENDING)`:

```prisma
  status              ExpenseStatus        @default(PENDING)
  paidDate            DateTime?
  expenseDate         DateTime?
```

Y agrega el índice `@@index([paidDate])`. Para que el anclaje sea único de
`ExpenseRecord` (la pareja `dueDate`/`sourceIssueDate` también existe en `IncomeRecord`),
incluye `@@index([expenseDate])` como contexto. Reemplaza:

```prisma
  @@index([expenseDate])
  @@index([dueDate])
  @@index([sourceIssueDate])
```

por:

```prisma
  @@index([expenseDate])
  @@index([dueDate])
  @@index([paidDate])
  @@index([sourceIssueDate])
```

- [ ] **Step 2: Generar la migración sin aplicar**

Run: `cd backend && npx prisma migrate dev --name expense_paid_date --create-only`
Expected: crea `prisma/migrations/<timestamp>_expense_paid_date/migration.sql` con
`ALTER TABLE "expense_records" ADD COLUMN "paidDate" ...` + `CREATE INDEX ...`. No aplica aún.

- [ ] **Step 3: Anexar la reparación al `migration.sql` generado**

Al final del `migration.sql` recién creado, agrega:

```sql

-- Resetea gastos marcados pagados por la importación (el pago se registra a mano).
UPDATE "expense_records"
SET "status" = 'PENDING'
WHERE "status" = 'PAID' AND "paidDate" IS NULL;
```

- [ ] **Step 4: Aplicar la migración y regenerar el cliente**

Run: `cd backend && npx prisma migrate deploy && npx prisma generate`
Expected: aplica la migración (no interactivo) y regenera el cliente Prisma (ahora el
modelo `ExpenseRecord` tiene `paidDate`).

- [ ] **Step 5: Verificar el dato**

Run:
```bash
docker exec vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT count(*) FROM expense_records WHERE status='PAID' AND \"paidDate\" IS NULL;"
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: agrega paidDate a gastos y repara estados pagados de importacion"
```

---

### Task 2: La importación de compras deja de clasificar

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.parser.ts`

- [ ] **Step 1: Importar siempre como PENDING**

En `parsePurchaseRows`, reemplaza:

```ts
        status: parsePaid(valueOf(row, 'PAGADO')) ? 'PAID' : 'PENDING',
```

por:

```ts
        // El libro de compras no declara pago: el cobro se registra a mano.
        status: 'PENDING',
```

- [ ] **Step 2: Eliminar el helper `parsePaid` (queda sin uso)**

Borra la función:

```ts
function parsePaid(value: unknown) {
  return upper(value) === 'SI';
}
```

Verifica que no quede ninguna otra referencia a `parsePaid` en el archivo (no la hay).

- [ ] **Step 3: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores (no debe quedar `parsePaid` sin usar ni referenciado).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.parser.ts
git commit -m "feat: la importacion de compras entra como pendiente, no clasifica pago"
```

---

### Task 3: Service y schema de gastos (pago, filtros, meses, guard)

**Files:**
- Modify: `backend/src/modules/expenses/expenses.schema.ts`
- Modify: `backend/src/modules/expenses/expenses.service.ts`

- [ ] **Step 1: Ampliar el schema**

En `expenses.schema.ts`, dentro de `listExpenseQuery`, agrega (junto a `isRecurring`):

```ts
  paymentState: z.enum(['payable', 'overdue', 'paid', 'cancelled']).optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato de mes inválido (YYYY-MM)')
    .optional(),
```

Y después de `export type ListExpenseFilters = ...`, agrega:

```ts
export const registerPaymentSchema = z.object({
  paidDate: dateInput.nullable(),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;
```

(`dateInput` ya está importado en este archivo.)

- [ ] **Step 2: Imports y constantes del service**

En `expenses.service.ts`, cambia el import de http-error:

```ts
import { badRequest, notFound } from '../../utils/http-error';
```

Agrega `RegisterPaymentInput` al import de tipos del schema:

```ts
import type {
  CreateExpenseInput,
  ListExpenseFilters,
  RegisterPaymentInput,
  UpdateExpenseInput,
} from './expenses.schema';
```

Después del bloque `const refs = {...};`, agrega:

```ts
// Estados de un gasto aún por pagar.
const PAYABLE_STATUSES = ['PENDING', 'OVERDUE'] as const;

// Invariante: el estado PAID solo es válido con fecha de pago. El paso a pagado se
// hace a mano vía registerPayment; el formulario no fija paidDate, así que un PAID
// sin paidDate se degrada a PENDING.
function normalizePaidStatus<T extends { status?: string | null }>(
  input: T,
  paidDate: Date | null,
): T {
  if (input.status === 'PAID' && !paidDate) {
    return { ...input, status: 'PENDING' };
  }
  return input;
}
```

- [ ] **Step 3: Aplicar filtros en `list`**

Reemplaza la función `list` completa por:

```ts
export async function list(filters: ListExpenseFilters) {
  const where: Prisma.ExpenseRecordWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    category: filters.category,
    status: filters.status,
  };
  if (filters.isRecurring) where.isRecurring = filters.isRecurring === 'true';

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

  return prisma.expenseRecord.findMany({
    where,
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    include: refs,
  });
}
```

- [ ] **Step 4: Guard en `create` y `update`**

Reemplaza `create`:

```ts
export async function create(input: CreateExpenseInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.expenseRecord.create({ data: input });
}
```

por:

```ts
export async function create(input: CreateExpenseInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  // create nunca recibe paidDate (no está en el schema): un PAID se degrada a PENDING.
  return prisma.expenseRecord.create({ data: normalizePaidStatus(input, null) });
}
```

Reemplaza `update`:

```ts
export async function update(id: string, input: UpdateExpenseInput) {
  const current = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Gasto no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.expenseRecord.update({ where: { id }, data: input });
}
```

por:

```ts
export async function update(id: string, input: UpdateExpenseInput) {
  const current = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { organizationId: true, paidDate: true },
  });
  if (!current) throw notFound('Gasto no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.expenseRecord.update({
    where: { id },
    data: normalizePaidStatus(input, current.paidDate),
  });
}
```

- [ ] **Step 5: `registerPayment` y `listMonths`**

Al final de `expenses.service.ts`, agrega:

```ts
export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!rec) throw notFound('Gasto no encontrado');
  if (rec.status === 'CANCELLED') throw badRequest('Un gasto anulado no se paga');
  const paidDate = input.paidDate ?? null;
  return prisma.expenseRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'PENDING',
    },
  });
}

/// Meses (YYYY-MM) que tienen gastos, ordenados descendente. Alimenta el filtro por mes.
export async function listMonths(organizationId?: string): Promise<string[]> {
  const orgClause = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('month', "expenseDate"), 'YYYY-MM') AS mes
    FROM "expense_records"
    WHERE "expenseDate" IS NOT NULL ${orgClause}
    ORDER BY mes DESC
  `);
  return rows.map((r) => r.mes);
}
```

- [ ] **Step 6: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/expenses/expenses.schema.ts backend/src/modules/expenses/expenses.service.ts
git commit -m "feat: pago manual, filtros de estado/mes y meses en gastos"
```

---

### Task 4: Controller y rutas de gastos

**Files:**
- Modify: `backend/src/modules/expenses/expenses.controller.ts`
- Modify: `backend/src/modules/expenses/expenses.routes.ts`

- [ ] **Step 1: Controllers**

En `expenses.controller.ts`, amplía el import del schema y agrega los dos controllers.
Cambia el import:

```ts
import {
  createExpenseSchema,
  listExpenseQuery,
  registerPaymentSchema,
  updateExpenseSchema,
} from './expenses.schema';
```

Y agrega (después de `listController`):

```ts
export async function listMonthsController(req: Request, res: Response) {
  const { organizationId } = listExpenseQuery
    .pick({ organizationId: true })
    .parse(req.query);
  res.json({ data: await service.listMonths(organizationId) });
}

export async function registerPaymentController(req: Request, res: Response) {
  const input = registerPaymentSchema.parse(req.body);
  res.json({ data: await service.registerPayment(req.params.id, input) });
}
```

- [ ] **Step 2: Rutas (months y payment antes de `/:id`)**

En `expenses.routes.ts`, agrega `listMonthsController` y `registerPaymentController` al
import desde `./expenses.controller`, y deja la sección de rutas así:

```ts
expensesRouter.get('/', asyncHandler(listController));
expensesRouter.get('/months', asyncHandler(listMonthsController));
expensesRouter.post('/', asyncHandler(createController));
expensesRouter.patch('/:id/payment', asyncHandler(registerPaymentController));
expensesRouter.get('/:id', asyncHandler(getController));
expensesRouter.patch('/:id', asyncHandler(updateController));
expensesRouter.delete('/:id', asyncHandler(removeController));
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/expenses/expenses.controller.ts backend/src/modules/expenses/expenses.routes.ts
git commit -m "feat: rutas de pago y meses de gastos"
```

---

## Chunk 2: Frontend

### Task 5: Tipos y hooks de gasto

**Files:**
- Modify: `frontend/src/types/domain.ts` (`ExpenseRecord`)
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Campos en `ExpenseRecord`**

En `types/domain.ts`, en la interfaz `ExpenseRecord`, agrega (junto a los demás campos,
p. ej. después de `status`):

```ts
  paidDate: string | null;
  sourceFolio: string | null;
```

- [ ] **Step 2: Ampliar `FinanceFilters.paymentState`**

En `useFinance.ts`, reemplaza:

```ts
  paymentState?: 'receivable' | 'overdue' | 'paid' | 'cancelled';
```

por:

```ts
  paymentState?: 'receivable' | 'payable' | 'overdue' | 'paid' | 'cancelled';
```

- [ ] **Step 3: Hooks de pago y meses de gasto**

En `useFinance.ts`, en la sección `// ----- Gastos -----` (cerca de `useExpenses`), agrega:

```ts
export function useRegisterExpensePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; paidDate: string | null }) =>
      api.patch(`/expenses/${payload.id}/payment`, { paidDate: payload.paidDate }),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useExpenseMonths(organizationId?: string) {
  return useQuery({
    queryKey: ['expenses', 'months', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: string[] }>(`/expenses/months${toQuery({ organizationId })}`)
        .then((r) => r.data),
  });
}
```

(`useQueryClient`, `useMutation`, `useQuery`, `api`, `toQuery`, `invalidateFinance` ya
están en el archivo.)

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/hooks/useFinance.ts
git commit -m "feat: tipo y hooks de pago de gastos"
```

---

### Task 6: Desacoplar `MonthFilter` y actualizar consumidores

**Files:**
- Modify: `frontend/src/components/MonthFilter.tsx`
- Modify: `frontend/src/pages/finance/IncomeTab.tsx`
- Modify: `frontend/src/pages/finance/ReceivablesTab.tsx`

- [ ] **Step 1: `MonthFilter` recibe `months`**

Reemplaza el contenido completo de `MonthFilter.tsx` por:

```tsx
import { Select } from '@/components/ui/select';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// 'YYYY-MM' → 'Enero 2026'
function labelMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const nombre = MESES[m - 1];
  return nombre != null ? `${nombre} ${y}` : ym;
}

export function MonthFilter({
  months,
  value,
  onChange,
}: {
  months: string[];
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      placeholder="Todos los meses"
      options={months.map((m) => ({ value: m, label: labelMes(m) }))}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}
```

- [ ] **Step 2: `ReceivablesTab` pasa `months`**

En `ReceivablesTab.tsx`, cambia el import de hooks:

```tsx
import { useIncome, useIncomeMonths, useRegisterPayment } from '@/hooks/useFinance';
```

Después de `const registrar = useRegisterPayment();`, agrega:

```tsx
  const { data: months = [] } = useIncomeMonths(organizationId);
```

Y reemplaza el bloque del filtro:

```tsx
          <MonthFilter
            organizationId={organizationId}
            value={month}
            onChange={setMonth}
          />
```

por:

```tsx
          <MonthFilter months={months} value={month} onChange={setMonth} />
```

- [ ] **Step 3: `IncomeTab` pasa `months`**

En `IncomeTab.tsx`, agrega `useIncomeMonths` al import desde `@/hooks/useFinance`
(junto a `useIncome`, `useDeleteIncome`, `type FinanceFilters`). Después de
`const remove = useDeleteIncome();`, agrega:

```tsx
  const { data: months = [] } = useIncomeMonths(organizationId);
```

Y reemplaza:

```tsx
          <MonthFilter
            organizationId={organizationId}
            value={extra.month}
            onChange={(month) => setExtra((x) => ({ ...x, month }))}
          />
```

por:

```tsx
          <MonthFilter
            months={months}
            value={extra.month}
            onChange={(month) => setExtra((x) => ({ ...x, month }))}
          />
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MonthFilter.tsx frontend/src/pages/finance/IncomeTab.tsx frontend/src/pages/finance/ReceivablesTab.tsx
git commit -m "refactor: MonthFilter recibe months por prop"
```

---

### Task 7: Pestaña `PayablesTab`

**Files:**
- Create: `frontend/src/pages/finance/PayablesTab.tsx`

- [ ] **Step 1: Crear el componente**

Crea `frontend/src/pages/finance/PayablesTab.tsx` con exactamente:

```tsx
import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useExpenses,
  useExpenseMonths,
  useRegisterExpensePayment,
} from '@/hooks/useFinance';
import { MonthFilter } from '@/components/MonthFilter';

type Estado = 'payable' | 'overdue' | 'paid' | 'cancelled';

const ESTADOS: { value: Estado; label: string }[] = [
  { value: 'payable', label: 'Por pagar' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'cancelled', label: 'Anuladas' },
];

export function PayablesTab({ organizationId }: { organizationId?: string }) {
  const [estado, setEstado] = useState<Estado>('payable');
  const [month, setMonth] = useState<string | undefined>();

  const { data: rows = [], isLoading, isError, error } = useExpenses({
    organizationId,
    paymentState: estado,
    month,
  });
  const { data: months = [] } = useExpenseMonths(organizationId);
  const registrar = useRegisterExpensePayment();

  const total = rows.reduce((s, r) => s + r.amount, 0);

  if (!organizationId) {
    return (
      <EmptyState title="Selecciona una empresa">
        Elige una empresa arriba para ver sus cuentas por pagar.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros de estado + mes */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              onClick={() => setEstado(e.value)}
              className={
                estado === e.value
                  ? 'rounded-md px-4 py-1.5 text-sm font-medium bg-[var(--color-primary)] text-white transition-colors'
                  : 'rounded-md px-4 py-1.5 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors'
              }
            >
              {e.label}
            </button>
          ))}
        </div>
        <div className="w-48">
          <MonthFilter months={months} value={month} onChange={setMonth} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Encabezado con total */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">
              {ESTADOS.find((e) => e.value === estado)?.label ?? estado}
            </h2>
          </div>
          {!isLoading && !isError && rows.length > 0 && (
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              Total:{' '}
              <span className="text-[var(--color-primary)]">
                {formatMoney(total)}
              </span>
            </span>
          )}
        </div>

        {isLoading && <Spinner label="Cargando gastos…" />}
        {isError && (
          <div className="p-5">
            <ErrorState message={getErrorMessage(error)} />
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState title="Sin gastos en este estado" />
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{r.vendorName ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.sourceFolio ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.expenseDate ? formatDate(r.expenseDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.dueDate ? formatDate(r.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {r.paidDate ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            registrar.mutate({ id: r.id, paidDate: null })
                          }
                          disabled={registrar.isPending}
                        >
                          Revertir
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            registrar.mutate({
                              id: r.id,
                              // Fecha LOCAL ('en-CA' → YYYY-MM-DD), no toISOString().
                              paidDate: new Date().toLocaleDateString('en-CA'),
                            })
                          }
                          disabled={registrar.isPending}
                        >
                          Marcar pagado
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {registrar.isError && (
        <ErrorState message={getErrorMessage(registrar.error)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/finance/PayablesTab.tsx
git commit -m "feat: pestana Cuentas por pagar con registro de pago"
```

---

### Task 8: Registrar la pestaña en `FinancePage`

**Files:**
- Modify: `frontend/src/pages/finance/FinancePage.tsx`

- [ ] **Step 1: Import**

Junto a los imports de tabs, agrega:

```tsx
import { PayablesTab } from './PayablesTab';
```

- [ ] **Step 2: Tipo de tab**

Reemplaza:

```tsx
type Tab = 'summary' | 'income' | 'expenses' | 'imports' | 'receivables';
```

por:

```tsx
type Tab = 'summary' | 'income' | 'expenses' | 'imports' | 'receivables' | 'payables';
```

- [ ] **Step 3: Entrada en `TABS`**

En el arreglo `TABS`, agrega la pestaña después de la de Gastos:

```tsx
  { id: 'expenses', label: 'Gastos' },
  { id: 'payables', label: 'Cuentas por pagar' },
  { id: 'imports', label: 'Importaciones' },
```

- [ ] **Step 4: Render**

Después de la línea `{tab === 'expenses' && <ExpensesTab organizationId={organizationId} />}`,
agrega:

```tsx
      {tab === 'payables' && <PayablesTab organizationId={organizationId} />}
```

- [ ] **Step 5: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/finance/FinancePage.tsx
git commit -m "feat: agrega pestana Cuentas por pagar a Finanzas"
```

---

## Verificación final (manual)

Tras completar los 8 tasks:

- [ ] **Typecheck backend:** `cd backend && npm run build` → PASS.
- [ ] **Typecheck/build frontend:** `cd frontend && npm run build` → PASS.
- [ ] **Prueba manual** (backend + frontend levantados):
  1. En Finanzas → Gastos, los 20 gastos ya **no** aparecen como Pagado (ahora Pendiente).
  2. Una nueva importación de compras entra toda como Pendiente.
  3. Nueva pestaña **Cuentas por pagar**: filtros de estado (Por pagar/Vencidas/Pagadas/
     Anuladas) y de mes funcionan; "Marcar pagado" mueve el gasto a Pagadas y el botón
     pasa a "Revertir"; revertir lo regresa a Por pagar.
  4. Crear/editar un gasto con estado *Pagado* desde el formulario lo deja *Pendiente*.
  5. Los filtros de mes de Ingresos y Cuentas por cobrar siguen funcionando (MonthFilter
     desacoplado).
