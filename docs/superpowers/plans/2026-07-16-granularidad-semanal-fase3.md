# Granularidad semanal en Finanzas — Fase 3 — Plan de implementación

**Goal:** La **lente semanal en las vistas**. Todos los endpoints de finanzas cambian `month: '2026-07'` por `granularity: 'week'|'month'` + `period: '2026-W28'|'2026-07'`. El frontend gana un `PeriodFilter` (selector de granularidad + etiquetas legibles). El dashboard muestra semana y mes en curso lado a lado. Se jubilan `currentMonthRange` (→ `currentPeriod('month')`) y los dos shims de `ledger.ts`.

**Spec:** `docs/superpowers/specs/2026-07-16-finanzas-granularidad-semanal-design.md` §4. **Léelo.** La tendencia (`/finance/trend`) y la cobertura son **Fase 4**, no van aquí.

**Decisión 7 (spec):** sin capa de compatibilidad para `month`. Backend y frontend se despliegan juntos; el typecheck caza cada consumidor. Es lo que hace esta fase mecánica: quita `month`, y compila lo que falte.

**Estado de partida:** `develop`, limpia, 245 tests verdes. Fases 0-2 en `main` + VPS.

**Convenciones:** todo español; fechas de calendario UTC; SQL con whitelist tipada. Verificación backend `npm test`+`npm run build`; frontend `npm run lint`.

---

## Chunk 1: Núcleo de consulta por período (backend)

### Task 1: Zod compartido — `granularity` y `periodKeyInput`

**Files:** `backend/src/modules/shared/zod.ts`

- [ ] Añade (absorbe las 4 copias de la regex del mes: `finance.schema.ts:3`, `income.schema.ts:54`, `expenses.schema.ts:52`, `finance-imports.schema.ts:58`):
```ts
export const granularity = z.enum(['week', 'month']).default('month');
// W01–W53 o 01–12. La validez real de la semana (W53 depende del año) la
// comprueba periodRange, no la regex (spec §4).
export const periodKeyInput = z
  .string()
  .regex(/^\d{4}-(W(0[1-9]|[1-4]\d|5[0-3])|(0[1-9]|1[0-2]))$/, 'Período inválido');
```

### Task 2: `resolvePeriodRange` en `period.ts`

**Files:** `backend/src/modules/shared/period.ts` · **Test:** `backend/test/period.test.ts`

- [ ] **Test primero:** `resolvePeriodRange('month', '2026-07')` → rango de julio; `resolvePeriodRange('week', undefined, reloj)` → semana en curso; forma de `period` que no case con `granularity` → `badRequest`.
- [ ] Implementa el helper que centraliza "resuelve el rango, y si falta el período usa el actual", validando que la forma case con la granularidad:
```ts
/** Rango del período pedido; si falta `key`, el período en curso. Valida forma↔granularidad. */
export function resolvePeriodRange(
  g: Granularity,
  key: string | undefined,
  now = new Date(),
): { gte: Date; lt: Date; key: string } {
  const k = key ?? currentPeriod(g, now);
  const esSemana = k.includes('W');
  if (esSemana !== (g === 'week')) {
    throw badRequest(`El período ${k} no corresponde a la granularidad ${g}`);
  }
  return { ...periodRange(g, k), key: k };
}
```

---

## Chunk 2: Endpoints backend (month → granularity+period)

> Patrón mecánico por endpoint: el schema cambia `month` por `{ granularity, period }`; el service recibe ambos y filtra con `resolvePeriodRange`/`periodRange`; el controller propaga. Donde el filtro era **opcional** (income/expenses/bancos: sin mes = todo), `period` sigue opcional y solo se filtra si viene.

### Task 3: Ingresos y gastos (`/income`, `/expenses`)

**Files:** `income.schema.ts`, `income.service.ts`, `income.controller.ts`, `income.routes.ts` (y los 4 gemelos de expenses)

- [ ] `income.schema.ts:54` / `expenses.schema.ts:52`: `month` → `granularity: granularity, period: periodKeyInput.optional()`.
- [ ] `income.service.ts:68` / `expenses.service.ts:53`: `if (filters.period) where.incomeDate = periodRange(filters.granularity, filters.period);`. Quita el import de `monthRange` (usa `periodRange` de `period.ts`).
- [ ] **Endpoint `/months` → `/periods`:** `income.routes.ts:17` y `expenses.routes.ts:17` pasan a `/periods`; el controller lee `granularity` del query y llama a `listPeriods(granularity, { source, organizationId })`. `income.service.ts:259 listMonths` → `listPeriods('income'/'expense'…)` directo (borrar el wrapper `ledgerListMonths`).

### Task 4: `finance-summary` — semana y mes lado a lado

**Files:** `finance-summary.service.ts`, `finance.schema.ts`, `finance.controller.ts`

- [ ] `getSummary(organizationId, { granularity, period })`:
  - **Siempre** calcula `monthIncome`/`monthExpense` (mes en curso, vía `currentPeriod('month')`) **y** `weekIncome`/`weekExpense` (semana en curso). Son el pulso del dashboard. `estimatedResult` sigue siendo del mes.
  - Los `groupBy(['category'])` y `groupBy(['organizationId'])` (`:60-79`) pasan a **filtrar por el período seleccionado** (`resolvePeriodRange(granularity, period)`), corrigiendo el bug de que hoy devuelven el histórico completo.
  - **Elimina** `import { currentMonthRange }`; usa `periodRange('month', currentPeriod('month'))`.
- [ ] `getConsolidated`: `month` → `{ granularity, period }`, propaga a `getReconciliationSummary`.
- [ ] `finance.schema.ts`: borra `monthRegex`/`month`; usa `granularity` + `periodKeyInput` en los tres query schemas (`:8`, `:13`, `:28`).
- [ ] `dashboard.service.ts:141-143`: **conserva** `monthIncome`/`monthExpense` y **añade** `weekIncome`/`weekExpense`. La capa de agente (`heuristic.ts`) no se toca (sigue narrando el mes).

### Task 5: Conciliación (`auto`, `recognize-transfers`)

**Files:** `finance-reconciliation.service.ts`, su schema y controller

- [ ] `getReconciliationSummary` (`:16`), `autoReconcile` (`:145`), `recognizeTransfers` (`:333`): `month?: string` → `{ granularity, period? }`. Cada `periodRange('month', month)` (`:21`, `:154`, `:353`) → `periodRange(granularity, period)` (solo si `period`).

### Task 6: Bancos (`/transactions`, `/transactions/periods`, `/transactions/periodic`, `/by-category`)

**Files:** `bank-transactions.service.ts`, `finance-imports.schema.ts`, `finance-imports.controller.ts`, `finance-imports.routes.ts`

- [ ] `listBankTransactions` (`:15`) y `listBankByCategory` (`:274`): `month` → `{ granularity, period? }`, `periodRange(granularity, period)`.
- [ ] `listBankTransactionMonths` → sirve `/transactions/periods` con `granularity`: ya delega en `listPeriods`; el controller pasa `granularity`. Ruta `:42` `/transactions/months` → `/transactions/periods`.
- [ ] **`listBankMonthly` → `listBankPeriodic`** (`:155`): generaliza a `granularity`. El SQL `date_trunc('month'…)`/`to_char(…'YYYY-MM')` pasa a la whitelist `TRUNC[g]` (igual que `listPeriods`). El campo de salida **`month` → `period`** (`:251`). `periodSeries('month'…)` → `periodSeries(g…)`. Ruta `:46` `/transactions/monthly` → `/transactions/periodic`. **La red de `bank-monthly.test.ts` cubre esto** — actualízala a `period` y añade un caso semanal.
- [ ] `finance-imports.schema.ts`: `listTransactionsQuery` y `listByCategoryQuery` `month` → `granularity`+`period`; añade `granularity` a las query de periods/periodic.

### Task 7: Jubilar `currentMonthRange` y los shims de `ledger.ts`

**Files:** `shared/dates.ts`, `shared/ledger.ts`, `test/ledger.test.ts`, `test/period.test.ts`

- [ ] Borra `currentMonthRange` de `dates.ts` (ya sin consumidores tras la Task 4).
- [ ] Borra los shims `monthRange`/`listMonths` de `ledger.ts` (sin consumidores tras Tasks 3-6; `ledger.ts` queda solo con `reconcilePaidStatus` y los estados).
- [ ] **Mueve** los `describe('monthRange')` y `describe('listMonths')` de `ledger.test.ts` a `period.test.ts` como `periodRange('month')`/`listPeriods('month')` (spec: los shims mueren aquí). `ledger.test.ts` conserva solo lo suyo (`reconcilePaidStatus`).

### Task 8: Suite backend verde

- [ ] `npm test && npm run build`. Actualiza los tests de servicio que pasaban `month:` a `granularity/period`. La red de caracterización debe seguir verde con los renombres.

---

## Chunk 3: Frontend

### Task 9: `lib/period.ts` con `periodLabel`

**Files:** `frontend/src/lib/period.ts` (crear)

- [ ] `periodLabel(key)`: `'2026-W28'` → `'Semana del 6 al 12 jul'`; `'2026-07'` → `'Julio 2026'`. Aritmética de semana ISO en UTC (copia mínima; el frontend no comparte con backend). Absorbe los nombres de meses de `MonthFilter.tsx:3` y `ConsolidatedPosition.tsx:15`.
- [ ] `currentPeriod(g)` y helpers de opciones de período para el filtro.

### Task 10: `PeriodFilter` (reemplaza `MonthFilter`)

**Files:** `frontend/src/components/PeriodFilter.tsx` (crear), borrar `MonthFilter.tsx`

- [ ] Selector de **granularidad** (Semana / Mes) + selector de período con etiquetas de `periodLabel`. `value = { granularity, period }`, `onChange`. Toma la lista de períodos del hook `…Periods`.

### Task 11: Hooks

**Files:** `finance-shared.ts`, `useIncome.ts`, `useExpenses.ts`, `useFinanceSummary.ts`, `useBankImports.ts`, `useReconciliation.ts`, barrel `useFinance.ts`

- [ ] Todas las queries `month` → `granularity`+`period` en `toQuery(...)`. Renombra `useIncomeMonths`/`useExpenseMonths`/`useBankTransactionMonths` → `…Periods` (query `granularity`), y `useBankMonthly` → `useBankPeriodic`. El barrel `useFinance.ts:4-15` reexporta los nuevos nombres. `types/banking.ts:81` campo `month` → `period`.

### Task 12: Páginas

**Files:** `DashboardPage.tsx`, `LedgerTab.tsx`, `IncomeTab/ExpensesTab/ReceivablesTab/PayablesTab`, `BanksTab.tsx`, `BankCategoryBreakdown.tsx`, `ConsolidatedPosition.tsx`, `FinanceSummaryTab.tsx`, `AutoReconcileModal.tsx`, `RecognizeTransfersModal.tsx`

- [ ] Sustituye `MonthFilter` por `PeriodFilter` y el estado `month` por `{ granularity, period }`. `LedgerTab` ya recibe su hook de períodos inyectado (`:20`), así que Cobrar/Pagar salen casi gratis.
- [ ] **Dashboard:** muestra **semana en curso y mes en curso lado a lado** (`weekIncome`/`weekExpense` junto a `monthIncome`/`monthExpense`).
- [ ] `types/dashboard.ts` y `types/finance.ts`: añade `weekIncome`/`weekExpense`; renombres de campos.

### Task 13: `npm run lint` limpio

---

## Chunk 4: Verificación y cierre

### Task 14: Verificación end-to-end

- [ ] `npm test` + `npm run build` (backend), `npm run lint` (frontend).
- [ ] `/verify`: levantar la app, en el dashboard ver semana+mes; en Cobrar/Pagar/Bancos cambiar el filtro Semana↔Mes y ver que los datos cambian; comprobar que una semana concreta filtra bien.

### Task 15: Deploy a producción (con aprobación del CEO)

- [ ] `pg_dump` prod → merge `develop`→`main` → `deploy.sh` → verificar health y que las vistas responden a `granularity&period`. Volver a `develop`. **No** desplegar sin visto bueno (esta fase no migra esquema, pero cambia el contrato de toda la API de finanzas; frontend y backend van juntos).
