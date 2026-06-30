# Evolución mensual de caja (Bancos) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la pestaña **Bancos** una vista de evolución mensual (saldo de cierre + flujo neto por mes) y aclarar la fecha del "Caja total".

**Architecture:** Un endpoint nuevo `GET /finance/imports/transactions/monthly` en el módulo existente `finance-imports` agrega `bank_transactions` por cuenta y mes (dos `$queryRaw`: flujos y saldo de cierre) y arma en JS la serie consolidada con carry-forward. El frontend consume el endpoint con un hook React Query y pinta una tabla con barras CSS dentro de `BanksTab.tsx`.

**Tech Stack:** Express + Prisma (`$queryRaw` con `Prisma.sql`), React + Vite + TanStack Query, Tailwind v4. **Sin framework de tests** en el repo: la verificación es el typecheck (`npm run build` en backend, `npm run lint` en frontend) + prueba manual contra los datos reales ya cargados.

**Spec:** `docs/superpowers/specs/2026-06-30-bancos-evolucion-mensual-design.md`

---

## Estructura de archivos

**Backend** (todo en `backend/src/modules/finance-imports/`):
- `finance-imports.service.ts` — **Modificar**: agregar `listBankMonthly` + helper `monthRange`.
- `finance-imports.controller.ts` — **Modificar**: agregar `listMonthlyController`.
- `finance-imports.routes.ts` — **Modificar**: registrar la ruta `/transactions/monthly`.
- `finance-imports.schema.ts` — **Sin cambios** (se reutiliza `listTransactionsQuery.pick(...)`).

**Frontend** (`frontend/src/`):
- `types/domain.ts` — **Modificar**: interface `BankMonthlyPoint`.
- `lib/domain.ts` — **Modificar**: helper `formatMonth`.
- `hooks/useFinance.ts` — **Modificar**: hook `useBankMonthly` (+ import del tipo).
- `pages/finance/BanksTab.tsx` — **Modificar**: sección de evolución + hint del "Caja total".

**Nota:** trabajamos en la rama `develop`, donde ya hay cambios en curso de la pestaña Bancos (sin commitear). Los commits de este plan tocan archivos distintos o secciones nuevas; al hacer `git add` usar **rutas explícitas** (nunca `git add -A`) para no arrastrar trabajo ajeno.

---

## Chunk 1: Backend — endpoint mensual

### Task 1: `listBankMonthly` en el service

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts`

- [ ] **Step 1: Agregar el helper `monthRange` al final del archivo** (junto a los otros helpers como `normalizePeriodMonth`):

```ts
/// Lista de meses 'YYYY-MM' contigua entre min y max (ambos inclusive), ascendente.
function monthRange(min: string, max: string): string[] {
  const out: string[] = [];
  let [y, m] = min.split('-').map(Number);
  const [maxY, maxM] = max.split('-').map(Number);
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
```

- [ ] **Step 2: Agregar `listBankMonthly`** (junto a `listBankTransactionMonths`, que ya usa el mismo patrón de `$queryRaw` con condiciones):

```ts
export async function listBankMonthly(filters: {
  organizationId?: string;
  bankAccountId?: string;
}) {
  const conditions = [Prisma.sql`1 = 1`];
  if (filters.organizationId) {
    conditions.push(Prisma.sql`"organizationId" = ${filters.organizationId}`);
  }
  if (filters.bankAccountId) {
    conditions.push(Prisma.sql`"bankAccountId" = ${filters.bankAccountId}`);
  }
  const whereSql = Prisma.join(conditions, ' AND ');

  // Flujos por cuenta y mes.
  const flows = await prisma.$queryRaw<
    { bankAccountId: string; mes: string; abonos: bigint; cargos: bigint }[]
  >(Prisma.sql`
    SELECT "bankAccountId",
           to_char(date_trunc('month', "transactionDate"), 'YYYY-MM') AS mes,
           SUM("creditAmount")::bigint AS abonos,
           SUM("chargeAmount")::bigint AS cargos
    FROM "bank_transactions"
    WHERE ${whereSql}
    GROUP BY "bankAccountId", mes
  `);

  if (flows.length === 0) return [];

  // Saldo de cierre por cuenta y mes = balance del último movimiento del mes.
  const closings = await prisma.$queryRaw<
    { bankAccountId: string; mes: string; cierre: number | null }[]
  >(Prisma.sql`
    SELECT DISTINCT ON ("bankAccountId", date_trunc('month', "transactionDate"))
           "bankAccountId",
           to_char(date_trunc('month', "transactionDate"), 'YYYY-MM') AS mes,
           "balance" AS cierre
    FROM "bank_transactions"
    WHERE ${whereSql}
    ORDER BY "bankAccountId", date_trunc('month', "transactionDate"),
             "transactionDate" DESC, "createdAt" DESC
  `);

  // Rango de meses [min..max] a partir de las claves devueltas (mismo grano).
  const allMonths = [
    ...flows.map((f) => f.mes),
    ...closings.map((c) => c.mes),
  ];
  const minMonth = allMonths.reduce((a, b) => (a < b ? a : b));
  const maxMonth = allMonths.reduce((a, b) => (a > b ? a : b));
  const months = monthRange(minMonth, maxMonth);

  const accountIds = [
    ...new Set([
      ...flows.map((f) => f.bankAccountId),
      ...closings.map((c) => c.bankAccountId),
    ]),
  ];

  const key = (acc: string, mes: string) => `${acc}|${mes}`;
  const flowMap = new Map(flows.map((f) => [key(f.bankAccountId, f.mes), f]));
  const closeMap = new Map(
    closings.map((c) => [key(c.bankAccountId, c.mes), c.cierre]),
  );

  // Por cada cuenta: serie de cierre con carry-forward. Antes de su primer
  // movimiento aporta 0 (no se arrastra hacia atrás).
  const carried = new Map<string, Map<string, number>>();
  for (const acc of accountIds) {
    const series = new Map<string, number>();
    let last = 0;
    let started = false;
    for (const mes of months) {
      const own = closeMap.get(key(acc, mes));
      if (own != null) {
        last = own;
        started = true;
      }
      series.set(mes, started ? last : 0);
    }
    carried.set(acc, series);
  }

  // Consolidar por mes y devolver más reciente primero.
  const result = months.map((mes) => {
    let closingBalance = 0;
    let credits = 0;
    let charges = 0;
    for (const acc of accountIds) {
      closingBalance += carried.get(acc)?.get(mes) ?? 0;
      const f = flowMap.get(key(acc, mes));
      if (f) {
        credits += Number(f.abonos);
        charges += Number(f.cargos);
      }
    }
    return {
      month: mes,
      closingBalance,
      netFlow: credits - charges,
      credits,
      charges,
    };
  });

  return result.reverse();
}
```

- [ ] **Step 3: Typecheck del backend**

Run: `cd backend && npm run build`
Expected: compila sin errores (genera `dist/`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.service.ts
git commit -m "feat: listBankMonthly (agregación mensual de caja con carry-forward)"
```

### Task 2: Controller + ruta

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.controller.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.routes.ts`

- [ ] **Step 1: Agregar `listMonthlyController`** en `finance-imports.controller.ts`, junto a `listTransactionMonthsController` (reutiliza el mismo `.pick`, idéntico patrón):

```ts
export async function listMonthlyController(req: Request, res: Response) {
  const filters = listTransactionsQuery
    .pick({ organizationId: true, bankAccountId: true })
    .parse(req.query);
  res.json({ data: await service.listBankMonthly(filters) });
}
```

(`listTransactionsQuery` ya está importado en el archivo; no agregar imports nuevos.)

- [ ] **Step 2: Registrar la ruta** en `finance-imports.routes.ts`. Agregar `listMonthlyController` al bloque de imports del controller, y la ruta **antes** de `'/transactions'` (junto a `/transactions/months`):

```ts
financeImportsRouter.get(
  '/transactions/monthly',
  asyncHandler(listMonthlyController),
);
```

Resultado del bloque de rutas de transactions (orden):
```ts
financeImportsRouter.get(
  '/transactions/months',
  asyncHandler(listTransactionMonthsController),
);
financeImportsRouter.get(
  '/transactions/monthly',
  asyncHandler(listMonthlyController),
);
financeImportsRouter.get('/transactions', asyncHandler(listTransactionsController));
```

- [ ] **Step 3: Typecheck del backend**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Verificación manual del endpoint** (el backend corre con `npm run dev` en `:4000`; requiere cookie de sesión, así que lo más simple es probar vía la UI en el Chunk 2. Si se quiere probar el SQL aislado, correr esta query en la BD para confirmar la forma de los datos):

Run:
```bash
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore -c "
SELECT to_char(date_trunc('month', \"transactionDate\"), 'YYYY-MM') AS mes,
       SUM(\"creditAmount\") AS abonos, SUM(\"chargeAmount\") AS cargos
FROM bank_transactions GROUP BY mes ORDER BY mes;"
```
Expected: 5 filas (2026-01 … 2026-05) con abonos/cargos > 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.controller.ts backend/src/modules/finance-imports/finance-imports.routes.ts
git commit -m "feat: endpoint GET /finance/imports/transactions/monthly"
```

---

## Chunk 2: Frontend — UI de evolución mensual

### Task 3: Tipo + helper de formato de mes

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/lib/domain.ts`

- [ ] **Step 1: Agregar la interface** en `types/domain.ts`, justo después de `BankTransactionsResponse` (o junto a los tipos de banco, ~línea 335):

```ts
export interface BankMonthlyPoint {
  month: string; // 'YYYY-MM'
  closingBalance: number;
  netFlow: number; // abonos − cargos
  credits: number; // abonos
  charges: number; // cargos
}
```

- [ ] **Step 2: Agregar `formatMonth`** en `lib/domain.ts`, junto a `formatDate` (~línea 197). Ojo: `month: 'short'` en `es-CL` devuelve minúscula (`'may'`); capitalizamos la inicial:

```ts
/** Formatea 'YYYY-MM' como 'May 2026' (mes capitalizado, en español). */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const raw = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CL', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // Algunos builds de ICU añaden un punto al mes abreviado ('may.'); quitarlo.
  const label = raw.replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
```

- [ ] **Step 3: Typecheck del frontend**

Run: `cd frontend && npm run lint`
Expected: sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/lib/domain.ts
git commit -m "feat: tipo BankMonthlyPoint y helper formatMonth"
```

### Task 4: Hook `useBankMonthly`

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Importar el tipo.** En el `import type { ... } from '@/types/domain'` (líneas 7-16), agregar `BankMonthlyPoint` a la lista (orden alfabético: antes de `BankTransactionsResponse`).

- [ ] **Step 2: Agregar el hook** justo después de `useBankTransactionMonths` (~línea 242):

```ts
export function useBankMonthly(filters: {
  organizationId?: string;
  bankAccountId?: string;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'monthly', filters],
    queryFn: () =>
      api
        .get<{ data: BankMonthlyPoint[] }>(
          `/finance/imports/transactions/monthly${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}
```

(No requiere cambios de invalidación: confirmar una importación ya invalida la key raíz `['finance-imports']`.)

- [ ] **Step 3: Typecheck del frontend**

Run: `cd frontend && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useFinance.ts
git commit -m "feat: hook useBankMonthly"
```

### Task 5: Sección de evolución + hint del "Caja total" en BanksTab

**Files:**
- Modify: `frontend/src/pages/finance/BanksTab.tsx`

- [ ] **Step 1: Importar lo nuevo.**
  - En el import de hooks (`@/hooks/useFinance`), agregar `useBankMonthly`.
  - En el import de `@/lib/domain`, agregar `formatMonth` (queda `formatDate, formatMoney, formatMonth`).

- [ ] **Step 2: Llamar al hook y calcular derivados.** Después de `const movements = useBankTransactions({...})` (~línea 32), agregar:

```ts
const monthly = useBankMonthly({
  organizationId,
  bankAccountId: bankAccountId || undefined,
});
```

Y junto a `totalCash` (useMemo, ~línea 45), agregar la fecha de la foto y el máximo de la barra:

```ts
// Fecha del último movimiento entre todas las cuentas (string ISO →
// comparación lexicográfica, NO Math.max sobre el raw).
const lastMovementDate = useMemo(() => {
  const dates = (accounts.data ?? [])
    .map((a) => a.lastMovementDate)
    .filter((d): d is string => Boolean(d));
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}, [accounts.data]);

const maxClosing = useMemo(
  () => Math.max(0, ...(monthly.data ?? []).map((m) => m.closingBalance)),
  [monthly.data],
);
```

- [ ] **Step 3: Aclarar el hint del "Caja total".** En la `MetricCard title="Caja total"` (~línea 74), reemplazar el `hint`:

```tsx
hint={
  lastMovementDate
    ? `${accounts.data.length} cuenta(s) · al ${formatDate(lastMovementDate)}`
    : `${accounts.data.length} cuenta(s)`
}
```

- [ ] **Step 4: Insertar la sección de evolución** entre el bloque de tarjetas de saldo (`</div>` del grid de MetricCards, ~línea 94) y el bloque de filtros (`{/* Filtros */}`, ~línea 96):

```tsx
{/* Evolución mensual de caja */}
{monthly.isLoading && <Spinner label="Cargando evolución…" />}
{monthly.data && monthly.data.length > 0 && (
  <Card className="overflow-hidden">
    <div className="border-b border-[var(--color-border)] px-4 py-3">
      <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
        Evolución mensual
      </h3>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Saldo al cierre de cada mes según las cartolas cargadas.
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
          <tr>
            <th className="px-4 py-3 font-medium">Mes</th>
            <th className="px-4 py-3 text-right font-medium">Saldo al cierre</th>
            <th className="px-4 py-3 text-right font-medium">Flujo neto</th>
            <th className="px-4 py-3 text-right font-medium">Abonos</th>
            <th className="px-4 py-3 text-right font-medium">Cargos</th>
            <th className="px-4 py-3 font-medium">Tendencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {monthly.data.map((m) => (
            <tr key={m.month} className="hover:bg-[var(--color-muted)]/40">
              <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-foreground)]">
                {formatMonth(m.month)}
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {formatMoney(m.closingBalance)}
              </td>
              <td
                className={
                  m.netFlow >= 0
                    ? 'px-4 py-3 text-right font-medium text-[var(--color-success)]'
                    : 'px-4 py-3 text-right font-medium text-[var(--color-danger)]'
                }
              >
                {formatMoney(m.netFlow)}
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-success)]">
                {m.credits ? formatMoney(m.credits) : '—'}
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-danger)]">
                {m.charges ? formatMoney(m.charges) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-[var(--color-muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{
                      width: `${
                        maxClosing > 0
                          ? Math.max(0, Math.min(100, (m.closingBalance / maxClosing) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
)}
```

- [ ] **Step 5: Typecheck del frontend**

Run: `cd frontend && npm run lint`
Expected: sin errores.

- [ ] **Step 6: Verificación manual en la UI** (backend `npm run dev` y frontend `npm run dev` corriendo; login con `ceo@vitam.tech`):
  1. Ir a Finanzas → Bancos. Aparece la sección "Evolución mensual" con 5 filas (Ene–May 2026), mayo arriba.
  2. El saldo de cierre de **May 2026** consolidado = **$15.199.023** (cuadra con "Caja total").
  3. La tarjeta "Caja total" muestra `2 cuenta(s) · al 29 may 2026`.
  4. Seleccionar **Banco Chile 1** → cierre de mayo = $5.715.731; **Banco Chile 2** → $9.483.292.
  5. El flujo neto de cada mes = abonos − cargos (signo en verde/rojo).
  6. Las barras de tendencia se ven proporcionales al saldo de cierre.
  7. Filtrar empresa = Vitam Tech (sin cuentas) → la pestaña muestra el empty state sin romperse.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/finance/BanksTab.tsx
git commit -m "feat: sección de evolución mensual y fecha en Caja total (Bancos)"
```

---

## Verificación final

- [ ] Backend compila: `cd backend && npm run build`.
- [ ] Frontend compila: `cd frontend && npm run lint` y `npm run build`.
- [ ] Los 7 puntos de verificación manual de la Task 5 pasan.
- [ ] Actualizar la memoria del roadmap (`finanzas-consolidacion-roadmap`) marcando el
      sub-proyecto A como hecho, para que la próxima sesión sepa que sigue B (categorización).
