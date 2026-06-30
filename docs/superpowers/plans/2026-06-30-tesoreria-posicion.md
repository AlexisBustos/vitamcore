# Posición consolidada / Tesorería — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar un bloque "Posición consolidada" (Caja + Por cobrar − Por pagar, por empresa) arriba de la pestaña Resumen de Finanzas.

**Architecture:** Una función `getFinancePosition` nueva en `finance.service.ts` (no toca `getSummary`) calcula caja por empresa (`$queryRaw` LATERAL) + por cobrar/por pagar agrupados, expuesta por `GET /finance/position`. El frontend agrega un hook y un componente `ConsolidatedPosition` montado al tope del Resumen; se refresca solo porque las mutaciones ya invalidan `['finance']`.

**Tech Stack:** Express + Prisma (`$queryRaw` + groupBy), React + Vite + TanStack Query, Tailwind v4. **Sin framework de tests**: verificación = typecheck (`backend: npm run build`, `frontend: npm run lint`/`build`) + manual.

**Spec:** `docs/superpowers/specs/2026-06-30-tesoreria-posicion-design.md`

---

## Estructura de archivos

**Backend** (módulo `finance`):
- `finance.service.ts` — **Modificar**: import `Prisma`, función `getFinancePosition`.
- `finance.controller.ts` — **Modificar**: `positionController`.
- `finance.routes.ts` — **Modificar**: ruta `/position`.

**Frontend**:
- `types/domain.ts` — **Modificar**: `FinancePosition` + `FinancePositionOrg`.
- `hooks/useFinance.ts` — **Modificar**: `useFinancePosition`.
- `pages/finance/ConsolidatedPosition.tsx` — **Crear**.
- `pages/finance/FinanceSummaryTab.tsx` — **Modificar**: render del bloque arriba.

**Nota:** rama `develop`, `git add` con rutas explícitas.

---

## Chunk 1: Backend

### Task 1: `getFinancePosition`

**Files:** `backend/src/modules/finance/finance.service.ts`

- [ ] **Step 1: Import de `Prisma`** — cambiar la línea de import de tipos (hoy `import type { ExpenseStatus, IncomeStatus } from '@prisma/client';`) por:
```ts
import { Prisma, type ExpenseStatus, type IncomeStatus } from '@prisma/client';
```

- [ ] **Step 2: Agregar la función** (al final del archivo, después de `getSummary`; reusa las constantes módulo `INCOME_PENDING`/`EXPENSE_PENDING`):
```ts
export async function getFinancePosition(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};

  const [cashRows, pendingSales, pendingManual, pendingExpense, orgs] =
    await Promise.all([
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
      // Por cobrar (ventas): neto positivo no pagado.
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
      // Por cobrar (manuales): sin neto, por estado pendiente.
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
      // Por pagar.
      prisma.expenseRecord.groupBy({
        by: ['organizationId'],
        _sum: { amount: true },
        where: { ...orgFilter, status: { in: EXPENSE_PENDING } },
      }),
      prisma.organization.findMany({ select: { id: true, name: true } }),
    ]);

  const cashByOrg = new Map<string, number>();
  for (const r of cashRows) cashByOrg.set(r.organizationId, Number(r.caja));

  const recByOrg = new Map<string, number>();
  for (const r of pendingSales) {
    recByOrg.set(
      r.organizationId,
      (recByOrg.get(r.organizationId) ?? 0) + (r._sum.netAmount ?? 0),
    );
  }
  for (const r of pendingManual) {
    recByOrg.set(
      r.organizationId,
      (recByOrg.get(r.organizationId) ?? 0) + (r._sum.amount ?? 0),
    );
  }

  const payByOrg = new Map<string, number>();
  for (const r of pendingExpense) {
    payByOrg.set(r.organizationId, r._sum.amount ?? 0);
  }

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const ids = new Set<string>([
    ...cashByOrg.keys(),
    ...recByOrg.keys(),
    ...payByOrg.keys(),
  ]);

  const byOrganization = [...ids]
    .map((id) => {
      const cash = cashByOrg.get(id) ?? 0;
      const receivable = recByOrg.get(id) ?? 0;
      const payable = payByOrg.get(id) ?? 0;
      return {
        id,
        name: orgName(id),
        cash,
        receivable,
        payable,
        position: cash + receivable - payable,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cash = byOrganization.reduce((s, o) => s + o.cash, 0);
  const receivable = byOrganization.reduce((s, o) => s + o.receivable, 0);
  const payable = byOrganization.reduce((s, o) => s + o.payable, 0);

  return {
    cash,
    receivable,
    payable,
    position: cash + receivable - payable,
    byOrganization,
  };
}
```

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 4: Verificación de datos** (opcional, confirma la caja consolidada):
```bash
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore -c "
SELECT ba.\"organizationId\", COALESCE(SUM(last.balance),0) AS caja
FROM bank_accounts ba
LEFT JOIN LATERAL (SELECT t.balance FROM bank_transactions t WHERE t.\"bankAccountId\"=ba.id ORDER BY t.\"transactionDate\" DESC, t.\"createdAt\" DESC LIMIT 1) last ON true
WHERE ba.\"isActive\"=true GROUP BY ba.\"organizationId\";"
```
Expected: la suma de Healthcare = 15199023.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance/finance.service.ts && git commit -m "feat: getFinancePosition (caja + por cobrar - por pagar por empresa)"
```

### Task 2: Controller + ruta

**Files:** `backend/src/modules/finance/finance.controller.ts`, `backend/src/modules/finance/finance.routes.ts`

- [ ] **Step 1: Controller** — en `finance.controller.ts`, agregar (reusa el `querySchema` local ya definido):
```ts
export async function positionController(req: Request, res: Response) {
  const { organizationId } = querySchema.parse(req.query);
  res.json({ data: await service.getFinancePosition(organizationId) });
}
```

- [ ] **Step 2: Ruta** — en `finance.routes.ts`, agregar `positionController` al import desde `./finance.controller` y registrar:
```ts
financeRouter.get('/position', asyncHandler(positionController));
```

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance/finance.controller.ts backend/src/modules/finance/finance.routes.ts && git commit -m "feat: endpoint GET /finance/position"
```

---

## Chunk 2: Frontend

### Task 3: Tipos + hook

**Files:** `frontend/src/types/domain.ts`, `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Tipos** (`types/domain.ts`) — agregar (junto a `FinanceSummary`):
```ts
export interface FinancePositionOrg {
  id: string;
  name: string;
  cash: number;
  receivable: number;
  payable: number;
  position: number;
}
export interface FinancePosition {
  cash: number;
  receivable: number;
  payable: number;
  position: number;
  byOrganization: FinancePositionOrg[];
}
```

- [ ] **Step 2: Hook** (`hooks/useFinance.ts`) — agregar `FinancePosition` al `import type { ... } from '@/types/domain'`, y agregar (junto a `useFinanceSummary`):
```ts
export function useFinancePosition(organizationId?: string) {
  return useQuery({
    queryKey: ['finance', 'position', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: FinancePosition }>(
          `/finance/position${toQuery({ organizationId })}`,
        )
        .then((r) => r.data),
  });
}
```

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores.

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/types/domain.ts frontend/src/hooks/useFinance.ts && git commit -m "feat: tipos y hook useFinancePosition"
```

### Task 4: Componente + integración

**Files:** `frontend/src/pages/finance/ConsolidatedPosition.tsx` (nuevo), `frontend/src/pages/finance/FinanceSummaryTab.tsx`

- [ ] **Step 1: Crear `ConsolidatedPosition.tsx`**:
```tsx
import { Wallet, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useFinancePosition } from '@/hooks/useFinance';

export function ConsolidatedPosition({
  organizationId,
}: {
  organizationId?: string;
}) {
  const { data, isLoading, isError, error } = useFinancePosition(organizationId);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={getErrorMessage(error)} />;

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
                    <tr key={o.id}>
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

- [ ] **Step 2: Integrar en `FinanceSummaryTab.tsx`** — agregar el import `import { ConsolidatedPosition } from './ConsolidatedPosition';` y renderizarlo como **primer hijo** del `<div className="space-y-6">` del return (antes del grid "Ingresos/Gastos del mes"):
```tsx
<ConsolidatedPosition organizationId={organizationId} />
```

- [ ] **Step 3: Typecheck + build** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint && npm run build`. Expected: ambos pasan.

- [ ] **Step 4: Verificación manual** (backend `npm run dev` + frontend `npm run dev`, login `ceo@vitam.tech`):
  1. Finanzas → Resumen: arriba aparece "Posición consolidada" con Caja, Por cobrar, Por pagar y Posición.
  2. Sin filtro de empresa, Caja = $15.199.023 (coincide con Bancos); Posición = Caja + Por cobrar − Por pagar.
  3. La tabla "Posición por empresa" aparece si hay >1 empresa con datos.
  4. Filtrar por una empresa acota las tarjetas y oculta la tabla por empresa.
  5. Conciliar/pagar una factura mueve por cobrar/por pagar y refresca la posición sin recargar.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/ConsolidatedPosition.tsx frontend/src/pages/finance/FinanceSummaryTab.tsx && git commit -m "feat: bloque de posición consolidada en el Resumen"
```

---

## Verificación final

- [ ] Backend compila: `cd backend && npm run build`.
- [ ] Frontend compila: `cd frontend && npm run lint` y `npm run build`.
- [ ] Los 5 puntos de verificación manual de la Task 4 pasan.
- [ ] Actualizar la memoria `finanzas-consolidacion-roadmap` marcando el sub-proyecto D como hecho — **consolidación de Finanzas completa (A+B+C+D)**.
