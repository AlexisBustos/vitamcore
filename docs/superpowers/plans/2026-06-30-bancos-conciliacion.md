# Conciliación bancaria — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conciliar facturas/gastos con el movimiento bancario que los pagó (invoice-centric): sugerir candidatos por monto/fecha, confirmar → marcar pagado con la fecha del movimiento y enlazarlo.

**Architecture:** FK `paidByBankTransactionId` del lado de la factura/gasto (un movimiento puede cubrir varias). Un endpoint nuevo de candidatos en `finance-imports` (lado banco) y la extensión del `registerPayment` existente de income/expenses con un `bankTransactionId` opcional (lado registro). El frontend agrega un `ReconcileModal` reutilizado en Cuentas por cobrar y por pagar.

**Tech Stack:** Express + Prisma (migración + Prisma queries), Zod, React + Vite + TanStack Query, Tailwind v4. **Sin framework de tests**: verificación = typecheck (`backend: npm run build`, `frontend: npm run lint`/`build`) + prueba manual.

**Spec:** `docs/superpowers/specs/2026-06-30-bancos-conciliacion-design.md`

---

## Estructura de archivos

**Backend**:
- `prisma/schema.prisma` — FK + relaciones en `IncomeRecord`/`ExpenseRecord`/`BankTransaction`.
- `prisma/migrations/<ts>_reconciliation_link/` — generada.
- `src/modules/finance-imports/finance-imports.{service,schema,controller,routes}.ts` — endpoint de candidatos.
- `src/modules/income/income.{service,schema}.ts` — `registerPayment` + `bankTransactionId`.
- `src/modules/expenses/expenses.{service,schema}.ts` — `registerPayment` + `bankTransactionId`.

**Frontend**:
- `types/domain.ts` — `paidByBankTransactionId` + `ReconciliationCandidate`.
- `hooks/useFinance.ts` — `useReconciliationCandidates` + extensión de las mutaciones de pago.
- `pages/finance/ReconcileModal.tsx` — **nuevo** modal reutilizado.
- `pages/finance/ReceivablesTab.tsx` y `PayablesTab.tsx` — botón "Conciliar" + modal.

**Nota:** rama `develop`, `git add` con rutas explícitas.

---

## Chunk 1: Backend

### Task 1: Esquema + migración

**Files:** `backend/prisma/schema.prisma`

- [ ] **Step 1: `IncomeRecord`** — agregar el escalar (junto a los otros, p.ej. tras `paidDate`):
```prisma
  paidByBankTransactionId String?
```
y la relación + índice (en el bloque de relaciones / índices del modelo):
```prisma
  paidByBankTransaction BankTransaction? @relation("IncomePayments", fields: [paidByBankTransactionId], references: [id], onDelete: SetNull)
```
```prisma
  @@index([paidByBankTransactionId])
```

- [ ] **Step 2: `ExpenseRecord`** — igual, con el nombre de relación `"ExpensePayments"`:
```prisma
  paidByBankTransactionId String?
```
```prisma
  paidByBankTransaction BankTransaction? @relation("ExpensePayments", fields: [paidByBankTransactionId], references: [id], onDelete: SetNull)
```
```prisma
  @@index([paidByBankTransactionId])
```

- [ ] **Step 3: `BankTransaction`** — agregar las relaciones inversas (en el bloque de relaciones, junto a `organization`/`bankAccount`/`importBatch`):
```prisma
  paidIncomes  IncomeRecord[]  @relation("IncomePayments")
  paidExpenses ExpenseRecord[] @relation("ExpensePayments")
```

- [ ] **Step 4: Migrar y typecheck**
```bash
cd /c/Workspace/Code/vitamcore/backend && npx prisma migrate dev --name reconciliation_link && npm run build
```
Expected: crea la migración (solo columnas/índices/FK), regenera el cliente, compila.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/prisma/schema.prisma backend/prisma/migrations && git commit -m "feat: enlace paidByBankTransactionId en income/expense (conciliación)"
```

### Task 2: Endpoint de candidatos

**Files:** `backend/src/modules/finance-imports/finance-imports.{schema,service,controller,routes}.ts`

- [ ] **Step 1: Schema** (`finance-imports.schema.ts`) — agregar:
```ts
export const reconciliationCandidatesQuery = z.object({
  recordType: z.enum(['income', 'expense']),
  recordId: z.string().min(1),
  search: z.string().trim().optional(),
});
export type ReconciliationCandidatesFilters = z.infer<typeof reconciliationCandidatesQuery>;
```

- [ ] **Step 2: Service** (`finance-imports.service.ts`) — agregar (usa `notFound`, ya importado; `Prisma` ya importado). Where clauses **explícitos por dirección** (evita keys dinámicas que romperían el typecheck):
```ts
export async function listReconciliationCandidates(filters: {
  recordType: 'income' | 'expense';
  recordId: string;
  search?: string;
}) {
  let organizationId: string;
  let target: number;
  let refDate: Date | null;
  const direction = filters.recordType === 'income' ? 'credit' : 'charge';

  if (filters.recordType === 'income') {
    const rec = await prisma.incomeRecord.findUnique({
      where: { id: filters.recordId },
      select: { organizationId: true, amount: true, netAmount: true, incomeDate: true, dueDate: true },
    });
    if (!rec) throw notFound('Ingreso no encontrado');
    organizationId = rec.organizationId;
    target = rec.netAmount ?? rec.amount;
    refDate = rec.incomeDate ?? rec.dueDate ?? null;
  } else {
    const rec = await prisma.expenseRecord.findUnique({
      where: { id: filters.recordId },
      select: { organizationId: true, amount: true, expenseDate: true, dueDate: true },
    });
    if (!rec) throw notFound('Gasto no encontrado');
    organizationId = rec.organizationId;
    target = rec.amount;
    refDate = rec.expenseDate ?? rec.dueDate ?? null;
  }

  const searchWhere: Prisma.BankTransactionWhereInput = filters.search
    ? { description: { contains: filters.search, mode: 'insensitive' } }
    : {};

  // Where por dirección (sin keys dinámicas).
  const dirWhere: Prisma.BankTransactionWhereInput =
    direction === 'credit'
      ? { ...searchWhere, organizationId, creditAmount: { gt: 0 } }
      : { ...searchWhere, organizationId, chargeAmount: { gt: 0 } };
  const exactWhere: Prisma.BankTransactionWhereInput =
    direction === 'credit'
      ? { ...searchWhere, organizationId, creditAmount: target }
      : { ...searchWhere, organizationId, chargeAmount: target };

  // Unión: montos exactos (sin tope de recencia) + los 100 más recientes.
  const [exactRows, recentRows] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: exactWhere,
      orderBy: { transactionDate: 'desc' },
      take: 50,
    }),
    prisma.bankTransaction.findMany({
      where: dirWhere,
      orderBy: { transactionDate: 'desc' },
      take: 100,
    }),
  ]);

  const byId = new Map<string, (typeof recentRows)[number]>();
  for (const t of [...exactRows, ...recentRows]) byId.set(t.id, t);

  const refTime = refDate ? refDate.getTime() : null;
  const ranked = [...byId.values()]
    .map((t) => {
      const amount = direction === 'credit' ? t.creditAmount : t.chargeAmount;
      return {
        id: t.id,
        transactionDate: t.transactionDate,
        description: t.description,
        amount,
        exact: amount === target,
        dist: refTime ? Math.abs(t.transactionDate.getTime() - refTime) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => (a.exact !== b.exact ? (a.exact ? -1 : 1) : a.dist - b.dist));

  const limit = filters.search ? 20 : 8;
  return ranked.slice(0, limit).map(({ dist: _dist, ...c }) => c);
}
```

- [ ] **Step 3: Controller** (`finance-imports.controller.ts`) — agregar `reconciliationCandidatesQuery` al import de schemas y:
```ts
export async function reconciliationCandidatesController(req: Request, res: Response) {
  const filters = reconciliationCandidatesQuery.parse(req.query);
  res.json({ data: await service.listReconciliationCandidates(filters) });
}
```

- [ ] **Step 4: Route** (`finance-imports.routes.ts`) — agregar el controller al import y registrar (path propio, sin conflicto):
```ts
financeImportsRouter.get(
  '/reconciliation/candidates',
  asyncHandler(reconciliationCandidatesController),
);
```

- [ ] **Step 5: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 6: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.schema.ts backend/src/modules/finance-imports/finance-imports.service.ts backend/src/modules/finance-imports/finance-imports.controller.ts backend/src/modules/finance-imports/finance-imports.routes.ts && git commit -m "feat: endpoint de candidatos de conciliación"
```

### Task 3: Extender registerPayment (income + expenses)

**Files:** `income.schema.ts`, `income.service.ts`, `expenses.schema.ts`, `expenses.service.ts`

- [ ] **Step 1: Schemas** — en `income.schema.ts` y `expenses.schema.ts`, en `registerPaymentSchema` (junto a `paidDate`), agregar:
```ts
  bankTransactionId: z.string().optional().nullable(),
```

- [ ] **Step 2: Income service** (`income.service.ts`) — reemplazar `registerPayment` por (amplía el `select` con `organizationId`; agrega `badRequest` import si falta —ya está):
```ts
export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true, organizationId: true, documentKind: true, netAmount: true },
  });
  if (!rec) throw notFound('Ingreso no encontrado');
  if (rec.documentKind === 'CREDIT_NOTE') {
    throw badRequest('Una nota de crédito no se cobra');
  }
  if (rec.netAmount === 0) {
    throw badRequest('Una factura anulada no se cobra');
  }

  // Conciliación: si viene un movimiento, manda él (paidDate se deriva).
  if (input.bankTransactionId) {
    const mov = await prisma.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: { id: true, organizationId: true, creditAmount: true, transactionDate: true },
    });
    if (!mov) throw notFound('Movimiento no encontrado');
    if (mov.organizationId !== rec.organizationId) {
      throw badRequest('El movimiento no pertenece a la empresa del ingreso');
    }
    if (mov.creditAmount <= 0) {
      throw badRequest('El movimiento no es un abono');
    }
    return prisma.incomeRecord.update({
      where: { id },
      data: {
        paidByBankTransactionId: mov.id,
        paidDate: mov.transactionDate,
        status: 'PAID',
      },
    });
  }

  // Pago manual / revertir: limpia el enlace.
  const paidDate = input.paidDate ?? null;
  return prisma.incomeRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'INVOICED',
      paidByBankTransactionId: null,
    },
  });
}
```

- [ ] **Step 3: Expenses service** (`expenses.service.ts`) — reemplazar `registerPayment` por (mantiene la guarda `CANCELLED`; **no** hay `netAmount`):
```ts
export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.expenseRecord.findUnique({
    where: { id },
    select: { id: true, organizationId: true, status: true },
  });
  if (!rec) throw notFound('Gasto no encontrado');
  if (rec.status === 'CANCELLED') throw badRequest('Un gasto anulado no se paga');

  if (input.bankTransactionId) {
    const mov = await prisma.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: { id: true, organizationId: true, chargeAmount: true, transactionDate: true },
    });
    if (!mov) throw notFound('Movimiento no encontrado');
    if (mov.organizationId !== rec.organizationId) {
      throw badRequest('El movimiento no pertenece a la empresa del gasto');
    }
    if (mov.chargeAmount <= 0) {
      throw badRequest('El movimiento no es un cargo');
    }
    return prisma.expenseRecord.update({
      where: { id },
      data: {
        paidByBankTransactionId: mov.id,
        paidDate: mov.transactionDate,
        status: 'PAID',
      },
    });
  }

  const paidDate = input.paidDate ?? null;
  return prisma.expenseRecord.update({
    where: { id },
    data: {
      paidDate,
      status: paidDate ? 'PAID' : 'PENDING',
      paidByBankTransactionId: null,
    },
  });
}
```

- [ ] **Step 4: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/income/income.schema.ts backend/src/modules/income/income.service.ts backend/src/modules/expenses/expenses.schema.ts backend/src/modules/expenses/expenses.service.ts && git commit -m "feat: registerPayment acepta bankTransactionId (conciliación)"
```

---

## Chunk 2: Frontend

### Task 4: Tipos + hooks

**Files:** `frontend/src/types/domain.ts`, `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Tipos** (`types/domain.ts`):
  - En `interface IncomeRecord` y `interface ExpenseRecord`, agregar:
    ```ts
      paidByBankTransactionId: string | null;
    ```
  - Agregar (junto a los otros tipos de banco):
    ```ts
    export interface ReconciliationCandidate {
      id: string;
      transactionDate: string;
      description: string;
      amount: number;
      exact: boolean;
    }
    ```

- [ ] **Step 2: Hook de candidatos** (`hooks/useFinance.ts`) — importar `ReconciliationCandidate` en el `import type`, y agregar:
```ts
export function useReconciliationCandidates(
  filters: { recordType: 'income' | 'expense'; recordId: string; search?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['finance-imports', 'reconcile', filters],
    enabled,
    queryFn: () =>
      api
        .get<{ data: ReconciliationCandidate[] }>(
          `/finance/imports/reconciliation/candidates${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}
```

- [ ] **Step 3: Extender las mutaciones de pago.** En `useRegisterPayment`, cambiar el payload y el body, y agregar la invalidación de `['finance-imports']` (mantener `invalidateFinance` y `['clients']`):
```ts
    mutationFn: (payload: {
      id: string;
      paidDate?: string | null;
      bankTransactionId?: string | null;
    }) =>
      api.patch(`/income/${payload.id}/payment`, {
        paidDate: payload.paidDate ?? null,
        bankTransactionId: payload.bankTransactionId ?? null,
      }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
```
En `useRegisterExpensePayment`, lo mismo (sin `['clients']`):
```ts
    mutationFn: (payload: {
      id: string;
      paidDate?: string | null;
      bankTransactionId?: string | null;
    }) =>
      api.patch(`/expenses/${payload.id}/payment`, {
        paidDate: payload.paidDate ?? null,
        bankTransactionId: payload.bankTransactionId ?? null,
      }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
```

- [ ] **Step 4: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores. (Nota: los llamados existentes `registrar.mutate({ id, paidDate })` siguen válidos porque `paidDate` queda opcional.)

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/types/domain.ts frontend/src/hooks/useFinance.ts && git commit -m "feat: tipos y hooks de conciliación"
```

### Task 5: Componente ReconcileModal

**Files:** `frontend/src/pages/finance/ReconcileModal.tsx` (nuevo)

Modal reutilizado por ambas pestañas. El padre (tab) es dueño de la mutación; el modal solo
informa la elección vía callbacks.

- [ ] **Step 1: Crear el componente**:
```tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { useReconciliationCandidates } from '@/hooks/useFinance';

export type ReconcileRecord = {
  id: string;
  name: string;
  folio: string | null;
  amount: number;
};

export function ReconcileModal({
  open,
  onClose,
  recordType,
  record,
  pending,
  onReconcile,
  onPayManual,
}: {
  open: boolean;
  onClose: () => void;
  recordType: 'income' | 'expense';
  record: ReconcileRecord | null;
  pending: boolean;
  onReconcile: (bankTransactionId: string) => void;
  onPayManual: () => void;
}) {
  const [search, setSearch] = useState('');
  const candidates = useReconciliationCandidates(
    { recordType, recordId: record?.id ?? '', search: search || undefined },
    open && !!record,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Conciliar con un movimiento"
      description={
        record
          ? `${record.name} · ${record.folio ?? 's/folio'} · ${formatMoney(record.amount)}`
          : undefined
      }
    >
      <div className="space-y-4">
        <Input
          placeholder="Buscar movimiento por descripción…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {candidates.isLoading && <Spinner label="Buscando movimientos…" />}
        {candidates.data && candidates.data.length === 0 && (
          <EmptyState title="Sin movimientos candidatos">
            Ajusta la búsqueda o usa “Marcar pagada sin movimiento”.
          </EmptyState>
        )}

        {candidates.data && candidates.data.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
            {candidates.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-[var(--color-foreground)]">
                      {c.description}
                    </span>
                    {c.exact && (
                      <Badge className="bg-emerald-50 text-emerald-700">calza exacto</Badge>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(c.transactionDate)} · {formatMoney(c.amount)}
                  </span>
                </div>
                <Button onClick={() => onReconcile(c.id)} disabled={pending}>
                  Conciliar
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end border-t border-[var(--color-border)] pt-3">
          <Button variant="outline" onClick={onPayManual} disabled={pending}>
            Marcar pagada sin movimiento
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores. (Confirmar que `Input`, `Badge`, `EmptyState`, `Spinner` existen en `components/ui/`.)

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/ReconcileModal.tsx && git commit -m "feat: componente ReconcileModal"
```

### Task 6: Integrar en ReceivablesTab y PayablesTab

**Files:** `frontend/src/pages/finance/ReceivablesTab.tsx`, `frontend/src/pages/finance/PayablesTab.tsx`

Mismo patrón en ambas (cambian los nombres: income→`clientName`, expense→`vendorName`; campo de
monto: income→`r.netAmount ?? r.amount`, expense→`r.amount`).

- [ ] **Step 1: Imports y estado** — en `ReceivablesTab.tsx`:
  - `import { ReconcileModal, type ReconcileRecord } from './ReconcileModal';`
  - estado: `const [reconciling, setReconciling] = useState<typeof rows[number] | null>(null);`

- [ ] **Step 2: Reemplazar el botón "Marcar pagada"** (rama `!r.paidDate`) por un botón "Conciliar":
```tsx
<Button onClick={() => setReconciling(r)} disabled={registrar.isPending}>
  Conciliar
</Button>
```
(La rama `r.paidDate` con "Revertir" se mantiene igual: `registrar.mutate({ id: r.id, paidDate: null })`.)

- [ ] **Step 3: Renderizar el modal** al final (dentro del `div` raíz, tras la `Card`):
```tsx
<ReconcileModal
  open={!!reconciling}
  onClose={() => setReconciling(null)}
  recordType="income"
  record={
    reconciling
      ? {
          id: reconciling.id,
          name: reconciling.clientName ?? '—',
          folio: reconciling.sourceFolio ?? null,
          amount: reconciling.netAmount ?? reconciling.amount,
        }
      : null
  }
  pending={registrar.isPending}
  onReconcile={(bankTransactionId) => {
    if (reconciling) registrar.mutate({ id: reconciling.id, bankTransactionId });
    setReconciling(null);
  }}
  onPayManual={() => {
    if (reconciling)
      registrar.mutate({
        id: reconciling.id,
        paidDate: new Date().toLocaleDateString('en-CA'),
      });
    setReconciling(null);
  }}
/>
```

- [ ] **Step 4: Igual en `PayablesTab.tsx`** — `recordType="expense"`, `name: reconciling.vendorName ?? '—'`, `amount: reconciling.amount`, y usa `registrar` (que es `useRegisterExpensePayment`).

- [ ] **Step 5: Typecheck + build** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint && npm run build`. Expected: sin errores.

- [ ] **Step 6: Verificación manual** (backend `npm run dev` + frontend `npm run dev`, login `ceo@vitam.tech`):
  1. Cuentas por cobrar → una factura sin pagar → "Conciliar" abre el modal con candidatos (abonos de la empresa), exactos primero con badge.
  2. Conciliar marca la factura pagada con la **fecha del movimiento** y aparece en "Pagadas".
  3. "Revertir" la devuelve a por cobrar.
  4. Igual en Cuentas por pagar (cargos).
  5. "Marcar pagada sin movimiento" funciona (fecha de hoy).
  6. La búsqueda en el modal encuentra un movimiento que no salía en el top.

- [ ] **Step 7: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/ReceivablesTab.tsx frontend/src/pages/finance/PayablesTab.tsx && git commit -m "feat: botón Conciliar y modal en cuentas por cobrar/pagar"
```

---

## Verificación final

- [ ] Backend compila: `cd backend && npm run build`. Migración aplicada.
- [ ] Frontend compila: `cd frontend && npm run lint` y `npm run build`.
- [ ] Los 6 puntos de verificación manual de la Task 6 pasan.
- [ ] Actualizar la memoria `finanzas-consolidacion-roadmap` marcando el sub-proyecto C como hecho (sigue D: posición consolidada).
