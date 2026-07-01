# Refactor Finanzas — Fase 2 (trocear finance-imports.service.ts y finance.service.ts) — Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dividir los dos archivos más grandes del dominio Finanzas (`finance-imports.service.ts` 1058 líneas y `finance.service.ts` 773) en módulos con una sola responsabilidad, **sin cambiar comportamiento**, con los 92 tests de Fase 0 como guardarraíl.

**Architecture:** Estrategia de **barrel re-export**. Cada archivo original (`finance-imports.service.ts`, `finance.service.ts`) se convierte en un *barrel* que re-exporta los símbolos públicos desde los nuevos módulos focalizados. Así el único importador de finance-imports (su controller), los importadores de `getSummary` (dashboard, agent/tools, agent/heuristic), el controller de finance y **los archivos de test que importan estos paths** quedan intactos. Cada extracción mueve código VERBATIM (mismo comportamiento, mismo raw SQL) + añade los imports necesarios; la verificación es la suite verde sin modificar + typecheck.

**Tech Stack:** Node + TypeScript (CommonJS), Prisma 5, Vitest. Guardarraíl: `npm test` (92 verdes) + `npm run build`, desde `backend/`. Rama: `develop` (crear `refactor/finanzas-fase2` desde develop antes de empezar).

**Commits:** terminar cada mensaje con
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Principio de oro (todas las tareas)
Tras cada extracción: `npm test` DEBE seguir en **92 verdes sin modificar ningún test**, y `npm run build` limpio. Si algo se pone rojo, el movimiento cambió comportamiento (import faltante, helper no exportado, orden) → arreglar el módulo, nunca el test. El barrel debe re-exportar EXACTAMENTE los mismos símbolos públicos que hoy.

---

## Mapa de destino

### finance-imports/ (nuevos archivos)
- `finance-imports.shared.ts` — `refs` (selects de organization + bankAccount), y el tipo `UploadFile` si conviene compartirlo.
- `finance-imports.serde.ts` — helpers puros: `serializeRows`, `serializeRecord`, `toJsonValue`, `deserializeRows`, `documentKindOf`, coercers (`stringOrNull`, `stringOrDefault`, `numberOrDefault`, `numberOrNull`, `dateOrNull`, `rawValue`), y el tipo `StoredPreviewRow`.
- `bank-accounts.service.ts` — `listBankAccounts` (raw SQL), `createBankAccount`, `updateBankAccount`, y `assertBankAccount` (exportado, lo usa el pipeline).
- `bank-transactions.service.ts` — `listBankTransactions`, `listBankTransactionMonths` (raw), `listBankMonthly` (raw), `listBankByCategory` (raw), `setCategoryBulk`, `setTransactionCategory`, y los privados `assertCategoryKey` y `monthRange`.
- `import-pipeline.service.ts` — `previewImport`, `confirmImport`, `listBatches`, `getBatch`, y privados `buildSalesSummary`, `readRows`, `readBankRows`, `parseRows`, `getExistingDedupeKeys`, `summarizeRows`, `createRow`, `linkCreditNotes`, `normalizePeriodMonth`.
- `reconciliation-candidates.service.ts` — `listReconciliationCandidates`.
- `finance-imports.service.ts` — **barrel**: `export * from './...'` de todos los módulos anteriores (mismos símbolos públicos que hoy).

### finance/ (nuevos archivos)
- `finance-shared.ts` — `computeReceivablePayable`, `computeOverdue`, constantes `INCOME_PENDING`/`EXPENSE_PENDING`, tipo `RecPay`.
- `finance-reconciliation.service.ts` — `getReconciliationSummary`, `autoReconcile`, `recognizeTransfers`, y privados `pairUp`, `docLabel`, `transferPayee`, tipos `AutoCandidate`/`AutoMov`, constantes `TRANSFER_OUT_PREFIX`/`TRANSFER_IN_PREFIX`.
- `finance-summary.service.ts` — `getSummary`, `getConsolidated` (raw SQL). Importa de `finance-shared` y llama a `getReconciliationSummary` de `finance-reconciliation`.
- `finance.service.ts` — **barrel**: re-exporta `getSummary`, `getConsolidated`, `getReconciliationSummary`, `autoReconcile`, `recognizeTransfers`.

---

## Chunk A: finance-imports

### Task 2.1: Extraer `finance-imports.serde.ts` (helpers puros)
**Files:** Create `backend/src/modules/finance-imports/finance-imports.serde.ts`; Modify `backend/src/modules/finance-imports/finance-imports.service.ts`.

- [ ] **Step 1** — Crear `finance-imports.serde.ts` y MOVER verbatim desde `finance-imports.service.ts`: `serializeRows`, `serializeRecord`, `toJsonValue`, `deserializeRows`, `documentKindOf`, `stringOrNull`, `stringOrDefault`, `numberOrDefault`, `numberOrNull`, `dateOrNull`, `rawValue`, y el tipo `StoredPreviewRow`. Exportar todo lo que el resto del service todavía usa (los coercers y `documentKindOf`/`deserializeRows`/`serializeRows` los usa el pipeline y `getBatch`). Imports necesarios: `Prisma` y `DocumentKind` de `@prisma/client`, y `import type { ParsedImportRow } from './finance-imports.parser'` (lo usan `StoredPreviewRow` y la firma de `serializeRows`). `Prisma.InputJsonValue`/`Prisma.JsonValue` vienen del import de `Prisma`.
- [ ] **Step 2** — En `finance-imports.service.ts`, borrar esas definiciones y `import { ... } from './finance-imports.serde'`.
- [ ] **Step 3** — `npm run build` limpio; `npm test` 92 verdes (sin tocar tests). `git status`: solo esos 2 archivos.
- [ ] **Step 4** — Commit: `refactor: extraer finance-imports.serde (helpers puros de serialización)`.

### Task 2.2: Extraer `bank-accounts.service.ts`
**Files:** Create `bank-accounts.service.ts`; Create `finance-imports.shared.ts` (con `refs`); Modify `finance-imports.service.ts`.

- [ ] **Step 1** — Crear `finance-imports.shared.ts` con `refs` (mover la const `refs` allí y exportarla), porque la usan varios clusters.
- [ ] **Step 2** — Crear `bank-accounts.service.ts` y mover verbatim `listBankAccounts` (raw SQL — mover íntegra con su `Prisma.sql`), `createBankAccount`, `updateBankAccount`, `assertBankAccount` (exportar `assertBankAccount`, lo usa el pipeline). Importar `prisma`, `Prisma`, `badRequest`/`notFound`, y los tipos de schema necesarios. NOTA: estas funciones usan `include: { organization: { select: … } }` inline y NO usan `refs`, así que NO importes `refs` aquí (solo lo usan bank-transactions y el pipeline).
- [ ] **Step 3** — En `finance-imports.service.ts`: borrar esas funciones + la const `refs` (ahora importada de shared); importar lo que aún use de `./bank-accounts.service` y `./finance-imports.shared`.
- [ ] **Step 4** — build limpio + 92 verdes sin tocar tests + `git status` solo los archivos previstos.
- [ ] **Step 5** — Commit: `refactor: extraer bank-accounts.service + finance-imports.shared (refs)`.

### Task 2.3: Extraer `bank-transactions.service.ts`
**Files:** Create `bank-transactions.service.ts`; Modify `finance-imports.service.ts`.

- [ ] **Step 1** — Mover verbatim: `listBankTransactions`, `listBankTransactionMonths` (raw), `listBankMonthly` (raw), `listBankByCategory` (raw), `setCategoryBulk`, `setTransactionCategory`, y privados `assertCategoryKey`, `monthRange`. Importar `refs` (de shared), `buildOwnAccounts`/`isInternalTransfer` (de `../shared/internal-transfer`), `prisma`, `Prisma`, `badRequest`, tipos de schema.
- [ ] **Step 2** — En el service: borrar esas funciones; importar lo que aún use.
- [ ] **Step 3** — build + 92 verdes + git status.
- [ ] **Step 4** — Commit: `refactor: extraer bank-transactions.service (consulta/analítica + categorización)`.

### Task 2.4: Extraer `import-pipeline.service.ts`
**Files:** Create `import-pipeline.service.ts`; Modify `finance-imports.service.ts`.

- [ ] **Step 1** — Mover verbatim el cluster de importación: `previewImport`, `confirmImport`, `listBatches`, `getBatch`, y privados `buildSalesSummary`, `readRows`, `readBankRows`, `parseRows`, `getExistingDedupeKeys`, `summarizeRows`, `createRow`, `linkCreditNotes`, `normalizePeriodMonth`, y el tipo `UploadFile` (o importarlo de shared si lo pusiste ahí). Importar: serde (de `./finance-imports.serde`), `refs` (shared), `assertBankAccount` (de `./bank-accounts.service`), `resolveParty` (`../shared/parties`), `categorizeWith` (`./finance-imports.categories`), `getActiveRules` (`../finance-categories/category-rules.service`), `assertOrganization` (`../shared/relations`), parser (`./finance-imports.parser`), `createHash`, `XLSX`, `prisma`, enums Prisma, tipos de schema.
- [ ] **Step 2** — En el service: borrar esas funciones; importar lo que aún use.
- [ ] **Step 3** — build + 92 verdes (ESPECIAL atención: los tests de `confirmImport` y el de dedupe-rollback deben seguir verdes — prueban que el pipeline movido conserva la transacción) + git status.
- [ ] **Step 4** — Commit: `refactor: extraer import-pipeline.service (preview/confirm/batches)`.

### Task 2.5: Extraer `reconciliation-candidates.service.ts` + convertir el service en barrel
**Files:** Create `reconciliation-candidates.service.ts`; Modify `finance-imports.service.ts` (→ barrel).

- [ ] **Step 1** — Mover `listReconciliationCandidates` a `reconciliation-candidates.service.ts` (usa solo Prisma ORM; importar `prisma`, tipos).
- [ ] **Step 2** — Reescribir `finance-imports.service.ts` como barrel con **re-exports nombrados explícitos** (no `export *`, para mantener la superficie pública byte-idéntica y no exponer `assertBankAccount` que hoy es privado):
```ts
export { listBankAccounts, createBankAccount, updateBankAccount } from './bank-accounts.service';
export {
  listBankTransactions, listBankTransactionMonths, listBankMonthly,
  listBankByCategory, setCategoryBulk, setTransactionCategory,
} from './bank-transactions.service';
export { previewImport, confirmImport, listBatches, getBatch } from './import-pipeline.service';
export { listReconciliationCandidates } from './reconciliation-candidates.service';
```
Son exactamente las 14 funciones que usa el controller hoy.
- [ ] **Step 3** — build + 92 verdes + `finance-imports.controller.ts` NO modificado (sigue con `import * as service from './finance-imports.service'`). git status.
- [ ] **Step 4** — Commit: `refactor: finance-imports.service pasa a barrel + reconciliation-candidates`.

---

## Chunk B: finance

### Task 2.6: Extraer `finance-shared.ts`
**Files:** Create `finance-shared.ts`; Modify `finance.service.ts`.

- [ ] **Step 1** — Mover verbatim `computeReceivablePayable`, `computeOverdue`, constantes `INCOME_PENDING`/`EXPENSE_PENDING`, tipo `RecPay`. Exportarlos. Importar `prisma`, `Prisma`, `ExpenseStatus`, `IncomeStatus`.
- [ ] **Step 2** — En `finance.service.ts`: borrar esas defs; `import { computeReceivablePayable, computeOverdue, INCOME_PENDING, EXPENSE_PENDING } from './finance-shared'`.
- [ ] **Step 3** — build + 92 verdes + git status.
- [ ] **Step 4** — Commit: `refactor: extraer finance-shared (computeReceivablePayable/computeOverdue)`.

### Task 2.7: Extraer `finance-reconciliation.service.ts`
**Files:** Create `finance-reconciliation.service.ts`; Modify `finance.service.ts`.

- [ ] **Step 1** — Mover verbatim `getReconciliationSummary`, `autoReconcile`, `recognizeTransfers`, y privados `pairUp`, `docLabel`, `transferPayee`, tipos `AutoCandidate`/`AutoMov`, constantes `TRANSFER_OUT_PREFIX`/`TRANSFER_IN_PREFIX`. Importar `buildOwnAccounts`/`isInternalTransfer` (`../shared/internal-transfer`), `prisma`, `Prisma`, enums, `badRequest`/`notFound` si aplica.
- [ ] **Step 2** — En `finance.service.ts`: borrar esas defs; importar `getReconciliationSummary` de `./finance-reconciliation.service` (lo usa `getConsolidated`).
- [ ] **Step 3** — build + 92 verdes (los tests de conciliación 1:1 / ambigüedad / traspaso interno deben seguir verdes) + git status.
- [ ] **Step 4** — Commit: `refactor: extraer finance-reconciliation.service`.

### Task 2.8: Extraer `finance-summary.service.ts` + convertir `finance.service.ts` en barrel
**Files:** Create `finance-summary.service.ts`; Modify `finance.service.ts` (→ barrel).

- [ ] **Step 1** — Mover `getSummary` y `getConsolidated` (raw SQL LATERAL — mover íntegra) a `finance-summary.service.ts`. Importar `currentMonthRange` (`../shared/dates`), `computeReceivablePayable`/`computeOverdue`/`INCOME_PENDING`/`EXPENSE_PENDING` (de `./finance-shared`), `getReconciliationSummary` (de `./finance-reconciliation.service`), `prisma`, `Prisma`.
- [ ] **Step 2** — Reescribir `finance.service.ts` como barrel: `export { getSummary, getConsolidated } from './finance-summary.service'; export { getReconciliationSummary, autoReconcile, recognizeTransfers } from './finance-reconciliation.service';`. Debe exponer los mismos símbolos que hoy (importante: `getSummary` para dashboard/agent, y `getConsolidated/autoReconcile/recognizeTransfers` para el controller).
- [ ] **Step 3** — build + 92 verdes; verificar que `finance.controller.ts`, `dashboard.service.ts`, `agent/tools.ts`, `agent/providers/heuristic.ts` NO se modificaron (siguen importando de `finance.service`). git status.
- [ ] **Step 4** — Commit: `refactor: finance.service pasa a barrel + finance-summary.service`.

---

## Cierre de Fase 2
- [ ] **Verificación final:** `npm test` (92 verdes) + `npm run build` limpio. Confirmar tamaños: ningún módulo nuevo supera ~una responsabilidad; `finance-imports.service.ts` y `finance.service.ts` quedan como barrels finos. Ningún test ni controller/importador externo modificado.
- [ ] **Handoff:** Fase 3 (frontend: dividir `useFinance.ts`/`types/domain.ts` + fix invalidación) y Fase 4 (UI genérica) siguen pendientes con su propio plan.
