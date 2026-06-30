# Consolidación de Finanzas — cuadre, auto-conciliación y vista unificada — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cruzar banco ↔ facturas/gastos de forma automática a escala (solo lo inequívoco) y juntar caja, por cobrar, por pagar, posición y cuadre del mes en una sola pantalla consolidada.

**Architecture:** Backend Express + Prisma sin cambios de schema: el estado de conciliación se DERIVA al leer vía la relación inversa existente (`BankTransaction.paidIncomes`/`paidExpenses`). Un helper compartido elimina la lógica duplicada de por-cobrar/por-pagar; un nuevo endpoint `getConsolidated` reemplaza a `getFinancePosition` y agrega el cuadre; `autoReconcile` enlaza los pares de monto único en una ventana de ±60 días. Frontend React + TanStack Query: `useConsolidated` reemplaza `useFinancePosition`, el Resumen gana el bloque Cuadre + botón Auto-conciliar, Bancos gana columna/filtro de conciliación y Gastos la columna Proveedor.

**Tech Stack:** Express, Prisma (PostgreSQL), Zod, TypeScript; React, Vite, TanStack Query v5, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-30-finanzas-consolidacion-cuadre-design.md`

**Rama:** `develop`. **Verificación:** typecheck (no hay tests). Backend `cd backend && npm run build`; Frontend `cd frontend && npm run lint && npm run build`. Postgres ya corriendo (`docker compose up -d`).

**Convención de commit:** cada tarea termina en un commit con el trailer:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Chunk 1: Backend — helpers, cuadre, consolidado, auto-conciliación y `reconciled` en la lista

Sin migración. Se reescribe `finance.service.ts` (helpers + `getSummary` deduplicado + `getReconciliationSummary` + `getConsolidated` + `autoReconcile`), se crea `finance.schema.ts`, se reescriben `finance.controller.ts` y `finance.routes.ts`, y se agrega `reconciled` + filtro `reconciliation` a `listBankTransactions`.

### Task 1: Helpers compartidos + `getSummary` deduplicado en `finance.service.ts`

**Files:**
- Modify: `backend/src/modules/finance/finance.service.ts`

- [ ] **Step 1: Reemplazar `getSummary` y agregar los helpers compartidos**

Reescribe el archivo completo dejando intacto todo salvo lo indicado. Sustituye **el cuerpo de `getSummary`** (líneas 12-241) por la versión que usa los helpers, y **agrega los dos helpers privados** justo antes de `getSummary`. Quita del `Promise.all` las 6 agregaciones que ahora viven en los helpers (`pendingSales`, `pendingManual`, `pendingExpense`, `overdueSales`, `overdueManual`, `overdueExpense`).

Inserta los helpers (después de las constantes `INCOME_PENDING`/`EXPENSE_PENDING`, antes de `getSummary`):

```ts
type RecPay = {
  receivable: number;
  payable: number;
  byOrg: Map<string, { receivable: number; payable: number }>;
};

/**
 * Por cobrar / por pagar por empresa + totales. Única fuente de verdad,
 * reusada por getSummary y getConsolidated (antes estaba duplicada inline).
 */
async function computeReceivablePayable(organizationId?: string): Promise<RecPay> {
  const orgFilter = organizationId ? { organizationId } : {};
  const [pendingSales, pendingManual, pendingExpense] = await Promise.all([
    prisma.incomeRecord.groupBy({
      by: ['organizationId'],
      _sum: { netAmount: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
      },
    }),
    prisma.incomeRecord.groupBy({
      by: ['organizationId'],
      _sum: { amount: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        netAmount: null,
        status: { in: INCOME_PENDING },
      },
    }),
    prisma.expenseRecord.groupBy({
      by: ['organizationId'],
      _sum: { amount: true },
      where: { ...orgFilter, status: { in: EXPENSE_PENDING } },
    }),
  ]);

  const byOrg = new Map<string, { receivable: number; payable: number }>();
  const bump = (id: string, key: 'receivable' | 'payable', v: number) => {
    const cur = byOrg.get(id) ?? { receivable: 0, payable: 0 };
    cur[key] += v;
    byOrg.set(id, cur);
  };
  for (const r of pendingSales) bump(r.organizationId, 'receivable', r._sum.netAmount ?? 0);
  for (const r of pendingManual) bump(r.organizationId, 'receivable', r._sum.amount ?? 0);
  for (const r of pendingExpense) bump(r.organizationId, 'payable', r._sum.amount ?? 0);

  let receivable = 0;
  let payable = 0;
  for (const v of byOrg.values()) {
    receivable += v.receivable;
    payable += v.payable;
  }
  return { receivable, payable, byOrg };
}

/**
 * Vencidos (por cobrar / por pagar). Extraído del inline de getSummary para
 * reusarlo en getConsolidated sin duplicarlo.
 */
async function computeOverdue(organizationId?: string): Promise<{
  overdueReceivable: { amount: number; count: number };
  overduePayable: { amount: number; count: number };
}> {
  const orgFilter = organizationId ? { organizationId } : {};
  const now = new Date();
  const [overdueSales, overdueManual, overdueExpense] = await Promise.all([
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
        dueDate: { lt: now },
      },
    }),
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        netAmount: null,
        status: { in: INCOME_PENDING },
        dueDate: { lt: now },
      },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...orgFilter, dueDate: { lt: now }, status: { in: EXPENSE_PENDING } },
    }),
  ]);
  return {
    overdueReceivable: {
      count: overdueSales._count._all + overdueManual._count._all,
      amount: (overdueSales._sum.netAmount ?? 0) + (overdueManual._sum.amount ?? 0),
    },
    overduePayable: {
      count: overdueExpense._count._all,
      amount: overdueExpense._sum.amount ?? 0,
    },
  };
}
```

Reemplaza el cuerpo de `getSummary` por esta versión (idéntico salvo que delega por-cobrar/por-pagar/vencidos a los helpers; **los números no cambian**):

```ts
export async function getSummary(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};
  const { start, end } = currentMonthRange();
  const now = new Date();

  const [
    monthIncome,
    monthExpense,
    recurringIncome,
    recurringExpense,
    incomeByCategory,
    expenseByCategory,
    incomeByOrg,
    expenseByOrg,
    upcomingIncome,
    upcomingExpense,
    collectedIncome,
    recPay,
    overdue,
  ] = await Promise.all([
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        incomeDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        expenseDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    prisma.incomeRecord.groupBy({
      by: ['category'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ['category'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.incomeRecord.groupBy({
      by: ['organizationId'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ['organizationId'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.incomeRecord.findMany({
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        dueDate: { gte: now },
        status: { in: INCOME_PENDING },
      },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true, description: true, amount: true, currency: true,
        dueDate: true, status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.expenseRecord.findMany({
      where: { ...orgFilter, dueDate: { gte: now }, status: { in: EXPENSE_PENDING } },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true, description: true, amount: true, currency: true,
        dueDate: true, status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: { ...orgFilter, status: { not: 'CANCELLED' }, paidDate: { not: null } },
    }),
    computeReceivablePayable(organizationId),
    computeOverdue(organizationId),
  ]);

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;

  const monthIncomeTotal = monthIncome._sum.amount ?? 0;
  const monthExpenseTotal = monthExpense._sum.amount ?? 0;

  const byOrgMap = new Map<string, { income: number; expense: number }>();
  for (const r of incomeByOrg) {
    byOrgMap.set(r.organizationId, { income: r._sum.amount ?? 0, expense: 0 });
  }
  for (const r of expenseByOrg) {
    const cur = byOrgMap.get(r.organizationId) ?? { income: 0, expense: 0 };
    cur.expense = r._sum.amount ?? 0;
    byOrgMap.set(r.organizationId, cur);
  }

  const upcomingFinancial = [
    ...upcomingIncome.map((i) => ({ ...i, kind: 'INCOME' as const })),
    ...upcomingExpense.map((e) => ({ ...e, kind: 'EXPENSE' as const })),
  ]
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 8);

  return {
    monthIncome: monthIncomeTotal,
    monthExpense: monthExpenseTotal,
    estimatedResult: monthIncomeTotal - monthExpenseTotal,
    pendingIncome: recPay.receivable,
    collectedIncome: collectedIncome._sum.netAmount ?? 0,
    pendingExpense: recPay.payable,
    recurringIncome: recurringIncome._sum.amount ?? 0,
    recurringExpense: recurringExpense._sum.amount ?? 0,
    overdueIncome: overdue.overdueReceivable,
    overdueExpense: overdue.overduePayable,
    incomeByCategory: incomeByCategory.map((c) => ({
      category: c.category ?? 'Sin categoría',
      amount: c._sum.amount ?? 0,
    })),
    expenseByCategory: expenseByCategory.map((c) => ({
      category: c.category ?? 'Sin categoría',
      amount: c._sum.amount ?? 0,
    })),
    byOrganization: Array.from(byOrgMap.entries()).map(([id, v]) => ({
      id,
      name: orgName(id),
      income: v.income,
      expense: v.expense,
      result: v.income - v.expense,
    })),
    upcomingFinancial,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores (el resto del archivo —`getFinancePosition`— sigue intacto por ahora).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/finance/finance.service.ts
git commit -m "refactor: helpers computeReceivablePayable/computeOverdue y getSummary deduplicado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2: `getReconciliationSummary`, `getConsolidated` y `autoReconcile`

**Files:**
- Modify: `backend/src/modules/finance/finance.service.ts`

- [ ] **Step 1: Reemplazar `getFinancePosition` por `getConsolidated` + agregar `getReconciliationSummary` y `autoReconcile`**

Elimina por completo la función `getFinancePosition` (líneas 243-349 del original) y en su lugar agrega las tres funciones siguientes. El import de `Prisma` (línea 5) **se conserva** porque `getConsolidated` reusa el `$queryRaw` LATERAL.

```ts
/**
 * Cuadre del mes (o de todos): abonos/cargos con total · conciliado · suelto,
 * derivado de la relación inversa paidIncomes/paidExpenses (no se persiste).
 */
export async function getReconciliationSummary(filters: {
  organizationId?: string;
  month?: string;
}) {
  const where: Prisma.BankTransactionWhereInput = {};
  if (filters.organizationId) where.organizationId = filters.organizationId;
  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    where.transactionDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  const rows = await prisma.bankTransaction.findMany({
    where,
    select: {
      creditAmount: true,
      chargeAmount: true,
      _count: { select: { paidIncomes: true, paidExpenses: true } },
    },
  });

  const credits = { total: 0, conciliado: 0, suelto: 0 };
  const charges = { total: 0, conciliado: 0, suelto: 0 };
  let unlinkedCount = 0;

  for (const r of rows) {
    const linkedIncome = r._count.paidIncomes > 0;
    const linkedExpense = r._count.paidExpenses > 0;
    if (r.creditAmount > 0) {
      credits.total += r.creditAmount;
      if (linkedIncome) credits.conciliado += r.creditAmount;
    }
    if (r.chargeAmount > 0) {
      charges.total += r.chargeAmount;
      if (linkedExpense) charges.conciliado += r.chargeAmount;
    }
    if (!linkedIncome && !linkedExpense) unlinkedCount += 1;
  }
  credits.suelto = credits.total - credits.conciliado;
  charges.suelto = charges.total - charges.conciliado;

  return { credits, charges, unlinkedCount };
}

/**
 * Posición consolidada (foto al día) + cuadre del mes. Reemplaza a
 * getFinancePosition. La posición ignora `month`; solo `reconciliation` lo usa.
 */
export async function getConsolidated(filters: {
  organizationId?: string;
  month?: string;
}) {
  const { organizationId, month } = filters;

  const [cashRows, recPay, overdue, orgs, reconciliation] = await Promise.all([
    prisma.$queryRaw<{ organizationId: string; caja: bigint }[]>(Prisma.sql`
      SELECT ba."organizationId", COALESCE(SUM(last.balance), 0)::bigint AS caja
      FROM "bank_accounts" ba
      LEFT JOIN LATERAL (
        SELECT t.balance FROM "bank_transactions" t
        WHERE t."bankAccountId" = ba.id
        ORDER BY t."transactionDate" DESC, t."createdAt" DESC
        LIMIT 1
      ) last ON true
      WHERE ba."isActive" = true ${
        organizationId
          ? Prisma.sql`AND ba."organizationId" = ${organizationId}`
          : Prisma.empty
      }
      GROUP BY ba."organizationId"
    `),
    computeReceivablePayable(organizationId),
    computeOverdue(organizationId),
    prisma.organization.findMany({ select: { id: true, name: true } }),
    getReconciliationSummary({ organizationId, month }),
  ]);

  const cashByOrg = new Map<string, number>();
  for (const r of cashRows) cashByOrg.set(r.organizationId, Number(r.caja));

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const ids = new Set<string>([...cashByOrg.keys(), ...recPay.byOrg.keys()]);

  const byOrganization = [...ids]
    .map((id) => {
      const cash = cashByOrg.get(id) ?? 0;
      const rp = recPay.byOrg.get(id) ?? { receivable: 0, payable: 0 };
      return {
        organizationId: id,
        name: orgName(id),
        cash,
        receivable: rp.receivable,
        payable: rp.payable,
        position: cash + rp.receivable - rp.payable,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cash = byOrganization.reduce((s, o) => s + o.cash, 0);

  return {
    cash,
    receivable: recPay.receivable,
    payable: recPay.payable,
    position: cash + recPay.receivable - recPay.payable,
    overdueReceivable: overdue.overdueReceivable,
    overduePayable: overdue.overduePayable,
    byOrganization,
    reconciliation,
  };
}

// ----- Auto-conciliación conservadora (solo pares de monto único) -----

type AutoCandidate = { id: string; target: number; date: Date | null };
type AutoMov = { id: string; amount: number; date: Date };

/**
 * Empareja facturas con movimientos solo cuando para un monto hay exactamente
 * UNA factura y UN movimiento, y el movimiento cae dentro de la ventana de fecha.
 * Si hay más de uno de cualquier lado, el monto es ambiguo y no se toca.
 */
function pairUp(invoices: AutoCandidate[], movs: AutoMov[], windowMs: number) {
  const invByAmount = new Map<number, AutoCandidate[]>();
  for (const inv of invoices) {
    const arr = invByAmount.get(inv.target) ?? [];
    arr.push(inv);
    invByAmount.set(inv.target, arr);
  }
  const movByAmount = new Map<number, AutoMov[]>();
  for (const mv of movs) {
    const arr = movByAmount.get(mv.amount) ?? [];
    arr.push(mv);
    movByAmount.set(mv.amount, arr);
  }

  const pairs: { invoiceId: string; movId: string; movDate: Date }[] = [];
  let ambiguousAmounts = 0;
  for (const [amount, invs] of invByAmount) {
    const ms = movByAmount.get(amount);
    if (!ms) continue; // factura sin movimiento del mismo monto: no es ambiguo
    if (invs.length === 1 && ms.length === 1) {
      const inv = invs[0];
      const mv = ms[0];
      // Requiere fecha de factura para validar la ventana; sin ella, va a manual.
      if (inv.date && Math.abs(mv.date.getTime() - inv.date.getTime()) <= windowMs) {
        pairs.push({ invoiceId: inv.id, movId: mv.id, movDate: mv.date });
      }
    } else {
      ambiguousAmounts += 1;
    }
  }
  return { pairs, ambiguousAmounts };
}

/**
 * Auto-concilia los pares inequívocos de una empresa. preview (apply:false) no
 * escribe; aplicar (apply:true) setea paidByBankTransactionId/paidDate/status=PAID
 * reusando la misma escritura que registerPayment. Idempotente.
 */
export async function autoReconcile(input: {
  organizationId: string;
  month?: string;
  apply: boolean;
}) {
  const { organizationId, month, apply } = input;
  const WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // ±60 días

  let range: { gte: Date; lt: Date } | null = null;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    range = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  const inRange = (d: Date | null) =>
    !range || (d != null && d >= range.gte && d < range.lt);

  const [incomes, creditMovs, expenses, chargeMovs] = await Promise.all([
    prisma.incomeRecord.findMany({
      where: {
        organizationId,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
      },
      select: {
        id: true, amount: true, netAmount: true,
        sourceIssueDate: true, incomeDate: true, dueDate: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: { organizationId, creditAmount: { gt: 0 }, paidIncomes: { none: {} } },
      select: { id: true, creditAmount: true, transactionDate: true },
    }),
    prisma.expenseRecord.findMany({
      where: { organizationId, status: { not: 'CANCELLED' }, paidDate: null },
      select: {
        id: true, amount: true,
        sourceIssueDate: true, expenseDate: true, dueDate: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: { organizationId, chargeAmount: { gt: 0 }, paidExpenses: { none: {} } },
      select: { id: true, chargeAmount: true, transactionDate: true },
    }),
  ]);

  const incomeCands: AutoCandidate[] = incomes
    .map((r) => ({
      id: r.id,
      target: r.netAmount ?? r.amount,
      date: r.sourceIssueDate ?? r.incomeDate ?? r.dueDate,
    }))
    .filter((c) => inRange(c.date));
  const expenseCands: AutoCandidate[] = expenses
    .map((r) => ({
      id: r.id,
      target: r.amount,
      date: r.sourceIssueDate ?? r.expenseDate ?? r.dueDate,
    }))
    .filter((c) => inRange(c.date));

  const incomeMovs: AutoMov[] = creditMovs.map((t) => ({
    id: t.id, amount: t.creditAmount, date: t.transactionDate,
  }));
  const expenseMovs: AutoMov[] = chargeMovs.map((t) => ({
    id: t.id, amount: t.chargeAmount, date: t.transactionDate,
  }));

  const inc = pairUp(incomeCands, incomeMovs, WINDOW_MS);
  const exp = pairUp(expenseCands, expenseMovs, WINDOW_MS);

  if (apply && (inc.pairs.length > 0 || exp.pairs.length > 0)) {
    await prisma.$transaction([
      ...inc.pairs.map((p) =>
        prisma.incomeRecord.update({
          where: { id: p.invoiceId },
          data: {
            paidByBankTransactionId: p.movId,
            paidDate: p.movDate,
            status: 'PAID',
          },
        }),
      ),
      ...exp.pairs.map((p) =>
        prisma.expenseRecord.update({
          where: { id: p.invoiceId },
          data: {
            paidByBankTransactionId: p.movId,
            paidDate: p.movDate,
            status: 'PAID',
          },
        }),
      ),
    ]);
  }

  return {
    pairs: inc.pairs.length + exp.pairs.length,
    linkedIncome: inc.pairs.length,
    linkedExpense: exp.pairs.length,
    ambiguousAmounts: inc.ambiguousAmounts + exp.ambiguousAmounts,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run build`
Expected: error de compilación en `finance.controller.ts` (`positionController` ya no existe `getFinancePosition`). **Es esperado**; se corrige en la Task 3. Confirma que el ÚNICO error es ese; si hay otros en `finance.service.ts`, corrígelos antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/finance/finance.service.ts
git commit -m "feat: getConsolidated + getReconciliationSummary + autoReconcile (reemplaza getFinancePosition)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3: Schema Zod, controller y rutas del módulo finance

**Files:**
- Create: `backend/src/modules/finance/finance.schema.ts`
- Modify: `backend/src/modules/finance/finance.controller.ts`
- Modify: `backend/src/modules/finance/finance.routes.ts`

- [ ] **Step 1: Crear `finance.schema.ts`**

```ts
import { z } from 'zod';

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = z.string().regex(monthRegex, 'Formato de mes inválido (YYYY-MM)');

export const consolidatedQuery = z.object({
  organizationId: z.string().optional(),
  month: month.optional(),
});

export const autoReconcileSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  month: month.optional(),
  apply: z.boolean().default(false),
});

export type ConsolidatedFilters = z.infer<typeof consolidatedQuery>;
export type AutoReconcileInput = z.infer<typeof autoReconcileSchema>;
```

- [ ] **Step 2: Reescribir `finance.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './finance.service';
import { autoReconcileSchema, consolidatedQuery } from './finance.schema';

const summaryQuery = z.object({ organizationId: z.string().optional() });

export async function summaryController(req: Request, res: Response) {
  const { organizationId } = summaryQuery.parse(req.query);
  res.json({ data: await service.getSummary(organizationId) });
}

export async function consolidatedController(req: Request, res: Response) {
  const filters = consolidatedQuery.parse(req.query);
  res.json({ data: await service.getConsolidated(filters) });
}

export async function autoReconcileController(req: Request, res: Response) {
  const input = autoReconcileSchema.parse(req.body);
  res.json({ data: await service.autoReconcile(input) });
}
```

- [ ] **Step 3: Reescribir `finance.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  autoReconcileController,
  consolidatedController,
  summaryController,
} from './finance.controller';

export const financeRouter = Router();

financeRouter.get('/summary', asyncHandler(summaryController));
financeRouter.get('/consolidated', asyncHandler(consolidatedController));
financeRouter.post('/reconciliation/auto', asyncHandler(autoReconcileController));
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores. `GET /finance/position` ya no existe (lo absorbió `/finance/consolidated`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/finance/finance.schema.ts backend/src/modules/finance/finance.controller.ts backend/src/modules/finance/finance.routes.ts
git commit -m "feat: rutas /finance/consolidated y /finance/reconciliation/auto

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4: `reconciled` + filtro `reconciliation` en `listBankTransactions`

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.schema.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts:90-140`

- [ ] **Step 1: Agregar el filtro `reconciliation` al schema**

En `finance-imports.schema.ts`, dentro de `listTransactionsQuery` (después de `category`), agrega:

```ts
  reconciliation: z.enum(['linked', 'unlinked']).optional(),
```

(`ListByCategoryFilters` usa `.pick({ organizationId, bankAccountId, month })`, así que no se ve afectado.)

- [ ] **Step 2: Aplicar el filtro y derivar `reconciled` en `listBankTransactions`**

En `finance-imports.service.ts`, reemplaza la función `listBankTransactions` (líneas 90-140) por:

```ts
export async function listBankTransactions(filters: ListTransactionsFilters) {
  const where: Prisma.BankTransactionWhereInput = {
    organizationId: filters.organizationId,
    bankAccountId: filters.bankAccountId,
  };

  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    where.transactionDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  if (filters.search) {
    where.description = { contains: filters.search, mode: 'insensitive' };
  }

  if (filters.category) {
    where.category = filters.category === '__none__' ? null : filters.category;
  }

  // Conciliado = referenciado por alguna factura/gasto vía paidByBankTransactionId.
  if (filters.reconciliation === 'linked') {
    where.OR = [{ paidIncomes: { some: {} } }, { paidExpenses: { some: {} } }];
  } else if (filters.reconciliation === 'unlinked') {
    where.paidIncomes = { none: {} };
    where.paidExpenses = { none: {} };
  }

  const transactions = await prisma.bankTransaction.findMany({
    where,
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    take: 300,
    include: {
      bankAccount: refs.bankAccount,
      _count: { select: { paidIncomes: true, paidExpenses: true } },
    },
  });

  const totals = transactions.reduce(
    (acc, t) => {
      acc.charges += t.chargeAmount;
      acc.credits += t.creditAmount;
      return acc;
    },
    { charges: 0, credits: 0 },
  );

  const rows = transactions.map(({ _count, ...t }) => ({
    ...t,
    reconciled: _count.paidIncomes > 0 || _count.paidExpenses > 0,
  }));

  return {
    transactions: rows,
    totals: {
      count: rows.length,
      charges: totals.charges,
      credits: totals.credits,
      net: totals.credits - totals.charges,
      endingBalance: rows[0]?.balance ?? null,
      startingBalance: rows[rows.length - 1]?.balance ?? null,
    },
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.schema.ts backend/src/modules/finance-imports/finance-imports.service.ts
git commit -m "feat: reconciled derivado + filtro reconciliation en listBankTransactions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Frontend — tipos, hooks, modal de auto-conciliación y vista consolidada

Tipos nuevos + `reconciled` en `BankTransaction`; `useConsolidated` reemplaza `useFinancePosition`; `useAutoReconcile`; `AutoReconcileModal`; `ConsolidatedPosition` con bloque Cuadre + deep-link; `FinanceSummaryTab` sin duplicados; `FinancePage` con selector de mes y deep-link a Bancos.

### Task 5: Tipos (`types/domain.ts`)

**Files:**
- Modify: `frontend/src/types/domain.ts:375-393` (BankTransaction), `:498-512` (FinancePosition)

- [ ] **Step 1: Agregar `reconciled` a `BankTransaction`**

En la interfaz `BankTransaction`, después de `categoryManual: boolean;`, agrega:

```ts
  reconciled: boolean;
```

- [ ] **Step 2: Reemplazar `FinancePositionOrg`/`FinancePosition` por los tipos del consolidado**

Sustituye el bloque `FinancePositionOrg` + `FinancePosition` (líneas 498-512) por:

```ts
export interface ReconciliationSummary {
  credits: { total: number; conciliado: number; suelto: number };
  charges: { total: number; conciliado: number; suelto: number };
  unlinkedCount: number;
}

export interface ConsolidatedOrg {
  organizationId: string;
  name: string;
  cash: number;
  receivable: number;
  payable: number;
  position: number;
}

export interface ConsolidatedResponse {
  cash: number;
  receivable: number;
  payable: number;
  position: number;
  overdueReceivable: { amount: number; count: number };
  overduePayable: { amount: number; count: number };
  byOrganization: ConsolidatedOrg[];
  reconciliation: ReconciliationSummary;
}

export interface AutoReconcileResult {
  pairs: number;
  linkedIncome: number;
  linkedExpense: number;
  ambiguousAmounts: number;
}
```

- [ ] **Step 3: Verificar que no quedan referencias colgando a los tipos eliminados**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -i "FinancePosition" || echo "sin referencias"`
Expected: el typecheck reportará usos en `hooks/useFinance.ts` (se arreglan en la Task 6). No debe haber otros usos fuera de `useFinance.ts`. Si aparece algún archivo extra, anótalo para arreglarlo.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/domain.ts
git commit -m "feat: tipos ConsolidatedResponse/ReconciliationSummary/AutoReconcileResult + reconciled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6: Hooks (`hooks/useFinance.ts`)

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Ajustar imports de tipos**

En el bloque `import type { … } from '@/types/domain'`, **elimina** `FinancePosition` y **agrega** `ConsolidatedResponse` y `AutoReconcileResult`.

- [ ] **Step 2: Reemplazar `useFinancePosition` por `useConsolidated`**

Sustituye la función `useFinancePosition` (líneas 77-87) por:

```ts
export function useConsolidated(filters: { organizationId?: string; month?: string }) {
  return useQuery({
    queryKey: ['finance', 'consolidated', filters],
    queryFn: () =>
      api
        .get<{ data: ConsolidatedResponse }>(
          `/finance/consolidated${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}
```

- [ ] **Step 3: Agregar `reconciliation` a `BankTransactionFilters`**

En `BankTransactionFilters` (después de `category?: string;`), agrega:

```ts
  reconciliation?: 'linked' | 'unlinked';
```

- [ ] **Step 4: Agregar `useAutoReconcile`**

Justo después de `useConfirmFinanceImport` (antes de la función `invalidateFinance`), agrega:

```ts
export function useAutoReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      organizationId: string;
      month?: string;
      apply: boolean;
    }) =>
      api
        .post<{ data: AutoReconcileResult }>(
          '/finance/reconciliation/auto',
          payload,
        )
        .then((r) => r.data),
    // Solo el modo aplicar muta datos; el preview no invalida nada. Marca
    // facturas/gastos como PAID, así que invalida también clients (fichas de
    // cobranza) igual que useRegisterPayment.
    onSuccess: (_data, vars) => {
      if (vars.apply) {
        invalidateFinance(qc);
        qc.invalidateQueries({ queryKey: ['finance-imports'] });
        qc.invalidateQueries({ queryKey: ['clients'] });
      }
    },
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run lint`
Expected: error en `ConsolidatedPosition.tsx` (`useFinancePosition` ya no existe). **Es esperado**; se corrige en la Task 8.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useFinance.ts
git commit -m "feat: useConsolidated y useAutoReconcile (reemplaza useFinancePosition)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 7: Modal de auto-conciliación (`AutoReconcileModal.tsx`)

**Files:**
- Create: `frontend/src/pages/finance/AutoReconcileModal.tsx`

- [ ] **Step 1: Crear el modal**

```tsx
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { useAutoReconcile } from '@/hooks/useFinance';
import type { AutoReconcileResult } from '@/types/domain';

export function AutoReconcileModal({
  open,
  onClose,
  organizationId,
  month,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  month?: string;
}) {
  const auto = useAutoReconcile();
  const [preview, setPreview] = useState<AutoReconcileResult | null>(null);
  const [done, setDone] = useState<AutoReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Al abrir, corre el preview (apply:false). Limpia el estado al cerrar.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setDone(null);
      setError(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    auto
      .mutateAsync({ organizationId, month, apply: false })
      .then((r) => {
        if (!cancel) setPreview(r);
      })
      .catch((e) => {
        if (!cancel) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, month]);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const r = await auto.mutateAsync({ organizationId, month, apply: true });
      setDone(r);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Auto-conciliar movimientos exactos"
      description="Enlaza solo los pares de monto único dentro de ±60 días; lo ambiguo queda para el modal manual."
    >
      <div className="space-y-4">
        {loading && <Spinner label="Calculando…" />}
        {error && <ErrorState message={error} />}

        {!loading && !error && done && (
          <p className="text-sm text-[var(--color-foreground)]">
            Se enlazaron <strong>{done.pairs}</strong> par(es):{' '}
            {done.linkedIncome} ingreso(s) y {done.linkedExpense} gasto(s).
          </p>
        )}

        {!loading && !error && !done && preview && (
          <p className="text-sm text-[var(--color-foreground)]">
            Se enlazarán <strong>{preview.pairs}</strong> par(es) exacto(s) (
            {preview.linkedIncome} ingreso(s), {preview.linkedExpense} gasto(s)).{' '}
            {preview.ambiguousAmounts > 0
              ? `${preview.ambiguousAmounts} monto(s) quedan ambiguos para revisar a mano.`
              : 'No hay montos ambiguos.'}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
          <Button variant="outline" onClick={onClose}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button
              onClick={confirm}
              disabled={loading || !preview || preview.pairs === 0}
            >
              Confirmar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run lint`
Expected: sin errores nuevos por este archivo (sigue el error pendiente de `ConsolidatedPosition.tsx`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/finance/AutoReconcileModal.tsx
git commit -m "feat: AutoReconcileModal (preview + aplicar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8: Vista consolidada (`ConsolidatedPosition.tsx` + `FinanceSummaryTab.tsx` + `FinancePage.tsx`)

**Files:**
- Modify: `frontend/src/pages/finance/ConsolidatedPosition.tsx`
- Modify: `frontend/src/pages/finance/FinanceSummaryTab.tsx`
- Modify: `frontend/src/pages/finance/FinancePage.tsx`

- [ ] **Step 1: Reescribir `ConsolidatedPosition.tsx`**

Recibe `month`, la función de deep-link `onReviewUnlinked` y el callback para abrir el modal de auto-conciliar. Usa `useConsolidated`. Agrega el bloque Cuadre y mantiene la tabla por empresa (ahora con `o.organizationId` como key).

```tsx
import { Wallet, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Button } from '@/components/ui/button';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useConsolidated } from '@/hooks/useFinance';

// 'YYYY-MM' → 'mayo' para rotular el cuadre; undefined = todos los meses.
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
function cuadreLabel(month?: string): string {
  if (!month) return 'Cuadre — todos los meses';
  const [y, m] = month.split('-').map(Number);
  const nombre = MESES[m - 1];
  return nombre ? `Cuadre de ${nombre} ${y}` : `Cuadre ${month}`;
}

export function ConsolidatedPosition({
  organizationId,
  month,
  onReviewUnlinked,
  onAutoReconcile,
}: {
  organizationId?: string;
  month?: string;
  onReviewUnlinked: () => void;
  onAutoReconcile: () => void;
}) {
  const { data, isLoading, isError, error } = useConsolidated({ organizationId, month });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

  const rec = data.reconciliation;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Caja (bancos)" value={formatMoney(data.cash)} icon={Wallet} />
        <MetricCard
          title="Por cobrar"
          value={formatMoney(data.receivable)}
          icon={ArrowUpRight}
          tone="success"
        />
        <MetricCard
          title="Por pagar"
          value={formatMoney(data.payable)}
          icon={ArrowDownRight}
          tone="danger"
        />
        <MetricCard
          title="Posición"
          value={formatMoney(data.position)}
          icon={Scale}
          tone={data.position >= 0 ? 'success' : 'danger'}
          hint="Caja + Por cobrar − Por pagar"
        />
      </div>

      {/* Cuadre del mes (banco ↔ facturas/gastos) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{cuadreLabel(month)}</CardTitle>
          <Button variant="outline" onClick={onAutoReconcile}>
            Auto-conciliar exactos
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="py-2 font-medium" />
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">Conciliado</th>
                  <th className="py-2 text-right font-medium">Suelto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                <tr>
                  <td className="py-2 font-medium text-[var(--color-foreground)]">
                    Abonos (cobros)
                  </td>
                  <td className="py-2 text-right">{formatMoney(rec.credits.total)}</td>
                  <td className="py-2 text-right text-[var(--color-success)]">
                    {formatMoney(rec.credits.conciliado)}
                  </td>
                  <td className="py-2 text-right text-[var(--color-muted-foreground)]">
                    {formatMoney(rec.credits.suelto)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-[var(--color-foreground)]">
                    Cargos (pagos)
                  </td>
                  <td className="py-2 text-right">{formatMoney(rec.charges.total)}</td>
                  <td className="py-2 text-right text-[var(--color-success)]">
                    {formatMoney(rec.charges.conciliado)}
                  </td>
                  <td className="py-2 text-right text-[var(--color-muted-foreground)]">
                    {formatMoney(rec.charges.suelto)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {rec.unlinkedCount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <span>⚠ {rec.unlinkedCount} movimiento(s) sin enlazar</span>
              <button
                type="button"
                onClick={onReviewUnlinked}
                className="font-medium text-[var(--color-primary)] hover:underline"
              >
                revisar
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {data.byOrganization.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Posición por empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="py-2 font-medium">Empresa</th>
                    <th className="py-2 text-right font-medium">Caja</th>
                    <th className="py-2 text-right font-medium">Por cobrar</th>
                    <th className="py-2 text-right font-medium">Por pagar</th>
                    <th className="py-2 text-right font-medium">Posición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.byOrganization.map((o) => (
                    <tr key={o.organizationId}>
                      <td className="py-2 font-medium text-[var(--color-foreground)]">
                        {o.name}
                      </td>
                      <td className="py-2 text-right">{formatMoney(o.cash)}</td>
                      <td className="py-2 text-right text-[var(--color-success)]">
                        {formatMoney(o.receivable)}
                      </td>
                      <td className="py-2 text-right text-[var(--color-danger)]">
                        {formatMoney(o.payable)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatMoney(o.position)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Actualizar `FinanceSummaryTab.tsx` — pasar props al consolidado y quitar duplicados**

Cambia la firma para recibir y reenviar `month`, `onReviewUnlinked`, `onAutoReconcile`, y **elimina** el bloque de tarjetas "Por cobrar / Cobrado / Gastos pendientes" (líneas 48-63 del original), que ahora vive en el consolidado.

Reemplaza la firma y el render del `ConsolidatedPosition`:

```tsx
export function FinanceSummaryTab({
  organizationId,
  consolidatedMonth,
  onReviewUnlinked,
  onAutoReconcile,
}: {
  organizationId?: string;
  consolidatedMonth?: string;
  onReviewUnlinked: () => void;
  onAutoReconcile: () => void;
}) {
  const { data, isLoading, isError, error } = useFinanceSummary(organizationId);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

  return (
    <div className="space-y-6">
      <ConsolidatedPosition
        organizationId={organizationId}
        month={consolidatedMonth}
        onReviewUnlinked={onReviewUnlinked}
        onAutoReconcile={onAutoReconcile}
      />
      {/* … resto del tab sin cambios … */}
```

Y **borra** el bloque:

```tsx
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Por cobrar" value={formatMoney(data.pendingIncome)} />
        <MetricCard title="Cobrado" value={formatMoney(data.collectedIncome)} icon={CheckCircle2} tone="success" />
        <MetricCard title="Gastos pendientes" value={formatMoney(data.pendingExpense)} />
      </div>
```

Si tras borrarlo `CheckCircle2` queda sin uso, quítalo del import de `lucide-react` (el typecheck lo señala como variable no usada → error).

- [ ] **Step 3: Reescribir `FinancePage.tsx` — selector de mes del cuadre + deep-link a Bancos + modal**

```tsx
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { MonthFilter } from '@/components/MonthFilter';
import { cn } from '@/lib/utils';
import { useBankTransactionMonths } from '@/hooks/useFinance';
import { FinanceSummaryTab } from './FinanceSummaryTab';
import { IncomeTab } from './IncomeTab';
import { ExpensesTab } from './ExpensesTab';
import { FinanceImportsTab } from './FinanceImportsTab';
import { ReceivablesTab } from './ReceivablesTab';
import { PayablesTab } from './PayablesTab';
import { BanksTab } from './BanksTab';
import { AutoReconcileModal } from './AutoReconcileModal';

type Tab =
  | 'summary'
  | 'income'
  | 'expenses'
  | 'imports'
  | 'receivables'
  | 'payables'
  | 'banks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'receivables', label: 'Cuentas por cobrar' },
  { id: 'income', label: 'Ingresos' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'payables', label: 'Cuentas por pagar' },
  { id: 'banks', label: 'Bancos' },
  { id: 'imports', label: 'Importaciones' },
];

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('summary');
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  // Mes del Cuadre (no afecta posición). Default = mes más reciente con datos.
  const [consolidatedMonth, setConsolidatedMonth] = useState<string | undefined>();
  const [monthTouched, setMonthTouched] = useState(false);
  const months = useBankTransactionMonths({ organizationId });

  useEffect(() => {
    if (!monthTouched && !consolidatedMonth && (months.data?.length ?? 0) > 0) {
      setConsolidatedMonth(months.data![0]); // lista ordenada DESC
    }
  }, [months.data, monthTouched, consolidatedMonth]);

  // Deep-link a Bancos filtrado a "Suelto".
  const [banksInitialFilter, setBanksInitialFilter] =
    useState<'linked' | 'unlinked' | undefined>();
  function reviewUnlinked() {
    setBanksInitialFilter('unlinked');
    setTab('banks');
  }

  const [autoOpen, setAutoOpen] = useState(false);
  function openAutoReconcile() {
    if (!organizationId) {
      alert('Selecciona una empresa para auto-conciliar.');
      return;
    }
    setAutoOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Control ejecutivo de ingresos, gastos y compromisos."
        actions={
          <div className="flex items-center gap-2">
            {tab === 'summary' && (
              <div className="w-44">
                <MonthFilter
                  months={months.data ?? []}
                  value={consolidatedMonth}
                  onChange={(m) => {
                    setMonthTouched(true);
                    setConsolidatedMonth(m);
                  }}
                />
              </div>
            )}
            <div className="w-56">
              <OrganizationFilter
                value={organizationId}
                onChange={(v) => setOrganizationId(v || undefined)}
              />
            </div>
          </div>
        }
      />

      <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <FinanceSummaryTab
          organizationId={organizationId}
          consolidatedMonth={consolidatedMonth}
          onReviewUnlinked={reviewUnlinked}
          onAutoReconcile={openAutoReconcile}
        />
      )}
      {tab === 'receivables' && <ReceivablesTab organizationId={organizationId} />}
      {tab === 'income' && <IncomeTab organizationId={organizationId} />}
      {tab === 'expenses' && <ExpensesTab organizationId={organizationId} />}
      {tab === 'payables' && <PayablesTab organizationId={organizationId} />}
      {tab === 'banks' && (
        <BanksTab
          organizationId={organizationId}
          initialReconciliation={banksInitialFilter}
        />
      )}
      {tab === 'imports' && <FinanceImportsTab organizationId={organizationId} />}

      {autoOpen && organizationId && (
        <AutoReconcileModal
          open={autoOpen}
          onClose={() => setAutoOpen(false)}
          organizationId={organizationId}
          month={consolidatedMonth}
        />
      )}
    </div>
  );
}
```

Nota: `BanksTab` gana la prop `initialReconciliation` en el Chunk 3 (Task 9). El typecheck de este paso fallará hasta entonces; está bien — ambos cambios cierran en el commit del Chunk 3. Para mantener commits verdes, **haz el commit de esta Task 8 junto con la Task 9** (ver Step 4).

- [ ] **Step 4: Commit (diferido)**

No hagas commit aún: el typecheck del frontend no pasará hasta que `BanksTab` acepte `initialReconciliation` (Task 9). Continúa al Chunk 3 y commitea ambos juntos al final de la Task 9.

---

## Chunk 3: Frontend — Bancos (conciliación), Gastos (proveedor) y aviso en el modal manual

### Task 9: Bancos — columna y filtro de conciliación + prop `initialReconciliation`

**Files:**
- Modify: `frontend/src/pages/finance/BanksTab.tsx`

- [ ] **Step 1: Aceptar la prop y agregar el estado del filtro de conciliación**

Cambia la firma del componente y agrega el estado, inicializado con la prop del deep-link:

```tsx
export function BanksTab({
  organizationId,
  initialReconciliation,
}: {
  organizationId?: string;
  initialReconciliation?: 'linked' | 'unlinked';
}) {
  const [bankAccountId, setBankAccountId] = useState('');
  const [month, setMonth] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [reconciliation, setReconciliation] = useState<'' | 'linked' | 'unlinked'>(
    initialReconciliation ?? '',
  );
```

Y sincroniza cuando cambie el deep-link (al entrar desde "revisar"):

```tsx
  // Refleja el deep-link desde el Cuadre ("revisar" → Suelto).
  useEffect(() => {
    if (initialReconciliation) setReconciliation(initialReconciliation);
  }, [initialReconciliation]);
```

- [ ] **Step 2: Pasar el filtro al hook y limpiar selección al cambiarlo**

En la llamada `useBankTransactions`, agrega `reconciliation`:

```tsx
  const movements = useBankTransactions({
    organizationId,
    bankAccountId: bankAccountId || undefined,
    month,
    search: search || undefined,
    category: category || undefined,
    reconciliation: reconciliation || undefined,
  });
```

Y añade `reconciliation` a las dependencias del `useEffect` que limpia la selección:

```tsx
  useEffect(() => setSelected(new Set()), [bankAccountId, month, search, category, reconciliation]);
```

- [ ] **Step 3: Agregar el `Select` de conciliación a la barra de filtros**

La grilla de filtros pasa de `lg:grid-cols-4` a `lg:grid-cols-5`; agrega el nuevo `Select` después del de categorías:

```tsx
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-6xl lg:grid-cols-5">
```

```tsx
        <Select
          options={[
            { value: 'linked', label: 'Conciliado' },
            { value: 'unlinked', label: 'Suelto' },
          ]}
          placeholder="Toda conciliación"
          value={reconciliation}
          onChange={(e) =>
            setReconciliation(e.target.value as '' | 'linked' | 'unlinked')
          }
        />
```

- [ ] **Step 4: Agregar la columna Conciliación a la tabla**

En el `<thead>`, agrega una cabecera entre "Categoría" y "Cargo":

```tsx
                  <th className="px-4 py-3 font-medium">Conciliación</th>
```

En cada fila `<tbody>`, agrega la celda con el badge, entre la celda de Categoría y la de Cargo:

```tsx
                    <td className="px-4 py-3">
                      {t.reconciled ? (
                        <span className="inline-flex items-center rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
                          Conciliado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                          Suelto
                        </span>
                      )}
                    </td>
```

- [ ] **Step 5: Ajustar el `colSpan` del `<tfoot>`**

La fila de totales abarca desde el checkbox hasta antes de "Cargo". Con la columna nueva, el `colSpan` sube en 1:

```tsx
                      colSpan={showAccountColumn ? 7 : 6}
```

- [ ] **Step 6: Typecheck del frontend completo**

Run: `cd frontend && npm run lint && npm run build`
Expected: compila sin errores (cierra también el typecheck pendiente de la Task 8).

- [ ] **Step 7: Commit (incluye Task 8)**

```bash
git add frontend/src/pages/finance/ConsolidatedPosition.tsx frontend/src/pages/finance/FinanceSummaryTab.tsx frontend/src/pages/finance/FinancePage.tsx frontend/src/pages/finance/BanksTab.tsx
git commit -m "feat: vista consolidada con cuadre + deep-link y columna/filtro de conciliación en Bancos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 10: Gastos — columna Proveedor

**Files:**
- Modify: `frontend/src/pages/finance/ExpensesTab.tsx`

- [ ] **Step 1: Importar `Link`**

En la cabecera de imports, agrega:

```tsx
import { Link } from 'react-router-dom';
```

- [ ] **Step 2: Agregar la cabecera "Proveedor"**

En el `<thead>`, entre "Descripción" y "Empresa":

```tsx
                  <th className="px-4 py-3 font-medium">Proveedor</th>
```

- [ ] **Step 3: Agregar la celda del proveedor**

En cada fila, entre la celda de Descripción y la de Empresa, enlazada a la ficha cuando haya `vendorId` (igual que `PayablesTab`):

```tsx
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.vendorId ? (
                        <Link
                          to={`/proveedores/${r.vendorId}`}
                          className="hover:text-[var(--color-primary)] hover:underline"
                        >
                          {r.vendorName ?? '—'}
                        </Link>
                      ) : (
                        (r.vendorName ?? '—')
                      )}
                    </td>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run lint`
Expected: sin errores. (`ExpenseRecord` ya tiene `vendorName`/`vendorId`; si el typecheck dice lo contrario, verifica el tipo en `types/domain.ts` antes de continuar.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/finance/ExpensesTab.tsx
git commit -m "feat: columna Proveedor (razón social) en la tabla de Gastos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 11: Aviso de monto en el modal manual (`ReconcileModal.tsx`)

**Files:**
- Modify: `frontend/src/pages/finance/ReconcileModal.tsx`

- [ ] **Step 1: Mostrar un aviso sutil cuando el movimiento no calce con el monto de la factura**

`record.amount` es el monto objetivo y `c.exact` ya indica si calza. Para los candidatos **no exactos**, muestra una línea de aviso bajo la descripción. Reemplaza el bloque de la descripción/fecha del `<li>` (el `<div className="min-w-0">`) por:

```tsx
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
                  {record && !c.exact && (
                    <span className="mt-0.5 block text-xs text-[var(--color-warning)]">
                      ⚠ movimiento {formatMoney(c.amount)} ≠ factura{' '}
                      {formatMoney(record.amount)}
                    </span>
                  )}
                </div>
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run lint && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/finance/ReconcileModal.tsx
git commit -m "feat: aviso de descalce de monto en el modal de conciliación manual

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificación final (manual, tras implementar)

Sin framework de tests. Levanta el sistema (el CEO lo hace) y, con `ceo@vitam.tech`, en **Finanzas**:

1. **Resumen/Consolidado**: 4 tarjetas de posición + bloque **Cuadre del mes** (abonos/cargos · total/conciliado/suelto) y "⚠ N sin enlazar". El selector de mes solo afecta el Cuadre, no las tarjetas.
2. **[Auto-conciliar exactos]**: con una empresa seleccionada, el preview muestra N pares; al **Confirmar**, esas facturas/gastos quedan pagados y enlazados; el cuadre baja los "sueltos". Sin empresa → pide elegir una.
3. **Idempotencia**: re-ejecutar → 0 pares nuevos; los enlaces manuales no se tocan.
4. **[revisar]** → lleva a **Bancos** con el filtro en "Suelto"; el badge Conciliado/Suelto es correcto.
5. Un movimiento de **monto repetido** no se auto-concilia; se resuelve en el modal manual, que **avisa** si el monto no calza.
6. **Gastos** muestra la columna **Proveedor** (razón social) enlazada a `/proveedores/:id`.
7. Los números de por-cobrar/por-pagar coinciden con los del Resumen anterior (el helper deduplicó, no cambió la lógica).

## Notas de implementación

- **Sin migración de schema**: todo el estado de conciliación se deriva de la relación inversa existente `paidIncomes`/`paidExpenses`.
- **Orden de chunks**: el Chunk 1 (backend) deja `GET /finance/consolidated` y `POST /finance/reconciliation/auto` listos. El Chunk 2 puede tener typecheck rojo en el paso intermedio (Task 8) hasta que el Chunk 3 (Task 9) agregue la prop `initialReconciliation` a `BanksTab`; por eso el commit de la Task 8 se difiere y se cierra junto con la Task 9.
- **`alert()` en el deep-link de auto-conciliar**: es el patrón mínimo ya usado en `ExpensesTab` (`confirm(...)`); aceptable para esta app interna monousuario.
