# Fase 4 — Tendencia de 12 semanas + grilla de cobertura

**Fecha:** 2026-07-17
**Spec:** `docs/superpowers/specs/2026-07-16-finanzas-granularidad-semanal-design.md` (§4 Tendencia, §5 Cobertura)
**Estado:** en implementación
**Depende de:** Fases 0–3 (mergeadas): `shared/period.ts`, lote con `periodStart/periodEnd`, endpoints `granularity+period`.

Última fase del trabajo de granularidad semanal. Es **lo único nuevo** (no refactor): dos
endpoints y dos vistas que se apoyan en todo lo anterior. Cada pieza es independiente.

## 1. Backend — `GET /finance/trend`

`GET /finance/trend?granularity=week&last=12&organizationId?` → serie de
`{ period, income, expense, result }` de los últimos `last` períodos **hasta el actual**,
con los períodos sin datos en **cero** (un hueco en la serie es información, no ausencia).

- Nuevo `finance/finance-trend.service.ts` con `getTrend({ granularity, last, organizationId? })`,
  exportado por el barrel `finance.service.ts`.
- Serie de claves: `periodSeries(g, shiftBack(current, last-1), current)`.
- Suma por período con `date_trunc` + `to_char` usando la whitelist `TRUNC` de `period.ts`
  (nunca se interpola la granularidad cruda), una query para ingresos y otra para gastos;
  `status <> 'CANCELLED'`. Se rellenan ceros donde la query no trae período.
- Schema `trendQuery` (`granularity`, `last` 1–52 default 12, `organizationId?`), controller
  y ruta `financeRouter.get('/trend', …)`.

## 2. Backend — `GET /finance/imports/coverage`

`GET /finance/imports/coverage?organizationId&granularity&from&to` → para cada fuente y cada
período del rango `[from, to]`: `covered | partial | missing`.

- Nuevo `finance-imports/coverage.service.ts` con `getCoverage({ organizationId?, granularity, from, to })`.
- `from`/`to` son **claves de período** (mismo `periodKeyInput`), expandidas con `periodSeries`.
- Fuentes: **Ventas** (`SALES_REPORT`), **Compras** (`PURCHASE_REPORT`) y **una fila por
  cuenta bancaria activa** (`BANK_STATEMENT` por `bankAccountId`) — la cobertura bancaria es
  por cuenta, no por empresa (spec §5).
- Cobertura = unión de los rangos `[periodStart, periodEnd]` (inclusivos → semiabiertos) de
  los lotes **`CONFIRMED`**. Por celda: `covered` si el período cae entero en la unión,
  `partial` si hay solape parcial, `missing` si no hay solape. Una semana sin ventas con lote
  confirmado que la cubre cuenta como **cubierta** (el rango declarado, no las filas).
- Schema `coverageQuery`, controller y ruta `financeImportsRouter.get('/coverage', …)`.

## 3. Tests backend (Vitest, BD real)

`test/finance-trend.service.test.ts` y `test/coverage.service.test.ts`:
- Trend: serie de longitud `last`, ceros en períodos sin datos, filtro por empresa, income/expense/result correctos, borde de año.
- Coverage: `covered` (lote cubre la semana entera, incluso con 0 filas), `partial` (lote cubre parte), `missing` (sin lote), bancos desglosados por cuenta, lotes `PREVIEW` no cuentan.

## 4. Frontend — tendencia

- Hook `useFinanceTrend(granularity, last)` en un hook de finanzas.
- Componente de tendencia (barras income/expense por período + línea/valor de resultado),
  etiquetas legibles vía `periodLabel`. Se integra en la página de Finanzas (pestaña resumen
  o una sección propia).
- Tipos en `types/` sincronizados con la respuesta.

## 5. Frontend — grilla de cobertura

- Hook `useImportCoverage(...)`.
- Grilla en `FinanceImportsTab`: filas = fuentes (Ventas, Compras, una por cuenta bancaria),
  columnas = últimas 12 semanas, celdas **verde/ámbar/gris** (covered/partial/missing) con
  tooltip del período. Un hueco gris salta a la vista.

## Verificación

`npm test` (backend) + `npm run lint` (frontend) + `/verify` (recorrido real de Finanzas).
Commit `develop → main`, deploy al VPS con `deploy.sh` (sin migración de schema en esta fase).
