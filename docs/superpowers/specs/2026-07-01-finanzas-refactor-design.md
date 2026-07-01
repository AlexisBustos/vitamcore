# Refactor del dominio Finanzas — deduplicación, troceo y red de tests

**Fecha:** 2026-07-01
**Estado:** Aprobado (diseño)
**Rama sugerida:** `refactor/finanzas`
**Alcance:** refactorización interna del dominio Finanzas (backend + frontend). **Refactor puro: sin cambios de comportamiento, sin schema/migraciones, sin features nuevas.**

## Contexto y problema

El dominio Finanzas creció por sprints y hoy concentra la mayor duplicación y los archivos
más grandes del proyecto. Una auditoría del código detectó:

**Pares "gemelos" (duplicación estructural real):**
- `income.service.ts` (214 líneas) ⇔ `expenses.service.ts` (191): ~75-80% idéntico
  (`reconcilePaidStatus`, `refs`, `list` con `paymentState`, `getById`, `registerPayment`,
  `listMonths`, filtro `month`).
- `IncomeForm.tsx` (195) ⇔ `ExpenseForm.tsx` (195): >90% idénticos.
- `ReceivablesTab.tsx` (190) ⇔ `PayablesTab.tsx` (206): gemelos (incluye `ReconcileModal` inline idéntico).
- `ClientDetailPage.tsx` (251) ⇔ `VendorDetailPage.tsx` (230): gemelos.
- `ClientsPage.tsx` (180) ⇔ `VendorsPage.tsx` (139): gemelos.
- Hooks de income/expenses en `useFinance.ts`, controllers, routes y schemas: copias con
  distinto endpoint/query-key/enum.
- `clients.service.ts` (117) ⇔ `vendors.service.ts` (96): mismo patrón `computeStats`/`list`/`get`.
- `resolveClientId`/`resolveVendorId` en `shared/parties.ts` ya duplicados entre sí; y un
  segundo mecanismo (`upsertClient`/`upsertVendor`) en finance-imports.

**Archivos con múltiples responsabilidades:**
- `finance-imports.service.ts` (1082): CRUD de cuentas + consulta de movimientos + categorización
  + pipeline de import + serde/parsing + upserts de parte + candidatos de conciliación.
- `finance.service.ts` (773): KPIs + consolidado + subsistema de conciliación
  (`pairUp`/`autoReconcile`/`recognizeTransfers`).
- Frontend: `types/domain.ts` (624) y `useFinance.ts` (569) son barriles con todos los subdominios.

**Restricción crítica:** no hay tests automatizados (la verificación es el typecheck) y esto es
código de **dinero**, donde una fusión mal hecha descuadra cifras. Por eso el refactor va
precedido de una red de tests.

Adherencia a convenciones: es alta (controllers delgados, sin `fetch` directo, `process.env` solo
en bootstrap, errores por `utils/http-error`). El problema es duplicación y tamaño, **no**
violaciones de convención.

## Decisiones de diseño

- **Enfoque híbrido (C):** extraer lo idéntico a helpers/constantes/sub-componentes compartidos
  **y** unificar los gemelos de **UI** (>90% iguales, bajo riesgo lógico) en componentes genéricos;
  pero **mantener income/expenses como dos services de backend delgados** que comparten helpers, en
  vez de un service genérico único — porque su lógica de consulta diverge de verdad (income maneja
  `documentKind`/`CREDIT_NOTE`/`netAmount`/`RECEIVABLE_OR`; expenses no). Abstraer eso a la fuerza
  crearía una capa con fugas.
- **Tests primero (Vitest + BD de test real):** los filtros/`where` son justo lo que un mock de
  Prisma no verificaría; se usa una BD `vitamcore_test` real en el mismo Postgres de Docker.
- **Refactor puro y verificable por fases:** cada fase termina con tests verdes + typecheck antes
  de pasar a la siguiente. Sin cambios de comportamiento observable.
- **Barril de compatibilidad:** al dividir `types/domain.ts`, `domain.ts` queda como re-exportador
  para no tocar los imports existentes de todo el frontend.
- **Seguridad del SQL raw:** `listMonths` genérico recibe tabla/columna desde una **whitelist**
  tipada (el identificador no puede ir como parámetro de consulta).

## Fases

Cada fase es incremental y verificable de forma aislada.

### Fase 0 — Red de seguridad (tests)
- Instalar **Vitest** en `backend` (`vitest`, config, script `npm test`).
- BD de test: `vitamcore_test` en el Postgres de Docker; `.env.test` con `DATABASE_URL`; setup
  global que corre `prisma migrate deploy` una vez y trunca/sembra fixtures entre tests.
- **Tests de caracterización** que capturan el comportamiento ACTUAL (guardarraíl):
  - `income.service`: `list` por cada `paymentState` (receivable/overdue/paid/cancelled),
    `reconcilePaidStatus` (PAID→fija paidDate; salir de PAID→limpia), `create`/`update` con enlace
    de cliente, `registerPayment`, `listMonths`.
  - `expenses.service`: equivalentes (payable/overdue/paid/cancelled).
  - `clients.service`/`vendors.service`: `computeStats` (cobrado/por cobrar, NC, CANCELLED),
    `list`/`get` con `search`.
  - `shared/parties`: `resolveParty` por nombre (reutiliza/crea, case-insensitive) y por RUT.
- **Criterio de salida:** suite verde contra la BD de test.

### Fase 1 — Backend: extracción compartida
- `shared/ledger.ts`: `reconcilePaidStatus`, `monthRange(month)`, `listMonths(model, dateColumn, orgId)`
  (con whitelist), y constantes de estado (`PENDING_STATUSES`, `PAYABLE_STATUSES`).
- `shared/parties.ts`: colapsar a `resolveParty({ model, organizationId, rut?, name? })` que cubre
  import (por RUT) y manual (por nombre); reemplazar `upsertClient`/`upsertVendor` de finance-imports.
- `income.service`/`expenses.service` importan de `shared/ledger`; quedan delgados.
- `clients.service`/`vendors.service`: extraer el patrón común `listParties`/`getParty` con `statsFn`
  inyectada, manteniendo cada `computeStats` propio.
- **Criterio de salida:** los tests de Fase 0 siguen verdes sin modificarlos + typecheck.

### Fase 2 — Backend: trocear archivos grandes
- `finance-imports.service.ts` → `bank-accounts.service.ts`, `bank-transactions.query.ts`,
  `import-pipeline.service.ts`, y helpers puros de serde/coerción a `finance-imports.serde.ts`
  (junto a `parser.ts`). Routes/controllers recableados.
- `finance.service.ts` → `finance-summary.service.ts` (KPIs + `getConsolidated`) y
  `finance-reconciliation.service.ts` (`pairUp`/`autoReconcile`/`recognizeTransfers`/`transferPayee`).
- **Criterio de salida:** typecheck + tests verdes (añadir tests de conciliación si el troceo lo
  facilita).

### Fase 3 — Frontend: dividir barriles
- `hooks/useFinance.ts` → `useIncome`, `useExpenses`, `useBankImports`, `useBankCategories`,
  `useReconciliation`, `useFinanceSummary`, compartiendo el helper `invalidateFinance`.
- `types/domain.ts` → `types/{core,finance,banking,sales,dashboard}.ts` + `domain.ts` re-exportador.
- **Fix de asimetría:** mover `clients` **y** `vendors` dentro de `invalidateFinance`.
- **Criterio de salida:** `npm run lint` (typecheck) + `vite build`.

### Fase 4 — Frontend: UI genérica
- `LedgerForm` (parametrizado: kind, campo de parte/fecha, opciones de estado, hook de guardado,
  estado por defecto, título) reemplaza `IncomeForm`/`ExpenseForm`.
- `LedgerTab` (columnas, accessor de total, hooks list/months/registerPayment, `recordType`,
  builder de enlace) reemplaza `ReceivablesTab`/`PayablesTab`.
- `PartyListPage` (hook de lista, filtros, tarjetas de métrica, columnas, builder de ruta)
  reemplaza `ClientsPage`/`VendorsPage`.
- `PartyDetailPage` (hook de detalle, hook de pago, métricas, columnas, `deriveState`, kind NC-aware)
  reemplaza `ClientDetailPage`/`VendorDetailPage`.
- `lib/paymentState.ts`: mapas label/clase + `deriveState` compartidos (elimina `estadoCobro`/`estadoPago`).
- **Criterio de salida:** typecheck + `vite build` + verificación manual de cada pantalla
  (crear/editar/pagar/revertir en ingresos y gastos; listas y detalles de cliente/proveedor).

## Arquitectura resultante (resumen)

```
backend/src/modules/
  shared/
    ledger.ts        # reconcilePaidStatus, monthRange, listMonths, constantes de estado
    parties.ts       # resolveParty({ model, rut?, name? })  (unifica manual + import)
  income/  expenses/  # services delgados que usan shared/ledger
  clients/ vendors/   # services que usan listParties/getParty + statsFn propia
  finance/
    finance-summary.service.ts
    finance-reconciliation.service.ts
  finance-imports/
    bank-accounts.service.ts
    bank-transactions.query.ts
    import-pipeline.service.ts
    finance-imports.serde.ts  (+ parser.ts existente)

frontend/src/
  hooks/  useIncome, useExpenses, useBankImports, useBankCategories,
          useReconciliation, useFinanceSummary  (+ invalidateFinance compartido)
  types/  core.ts finance.ts banking.ts sales.ts dashboard.ts  (+ domain.ts barril)
  components/finance/  LedgerForm, LedgerTab
  components/parties/  PartyListPage, PartyDetailPage
  lib/    paymentState.ts
```

## No-objetivos

- Sin cambios de schema ni migraciones.
- Sin cambios de comportamiento observable (refactor puro).
- Sin features nuevas (paginación/búsqueda, multimoneda/decimales, etc. — deuda de backlog aparte).
- Sin tocar el módulo **Agent** (`tools.ts`/`heuristic.ts`): su troceo va alineado con el
  backlog de "agentes por dominio" y se trata como spec separado.
- Sin tests de frontend (se verifica con typecheck + prueba manual).

## Riesgos y mitigaciones

- **Fusión que descuadra cifras** → tests de caracterización en Fase 0 antes de tocar lógica.
- **Troceo rompe imports** → lo caza el typecheck; barril de compatibilidad para `types`.
- **Inyección en SQL raw de `listMonths`** → whitelist tipada de tabla/columna.
- **Regresión en UI genérica** → verificación manual pantalla por pantalla en Fase 4; los
  gemelos de UI son >90% idénticos, lo que acota la superficie.
- **Fricción de BD de test** → script de setup reproducible (`migrate deploy` + truncate/seed).

## Criterios de éxito

- Duplicación de los pares gemelos eliminada (income/expenses, clients/vendors, forms, tabs,
  páginas de parte, hooks).
- Ningún archivo de Finanzas supera un tamaño razonable por responsabilidad única.
- Suite de tests de backend verde; typecheck backend + frontend verdes; `vite build` OK.
- Comportamiento idéntico al actual, verificado por los tests y por prueba manual.
