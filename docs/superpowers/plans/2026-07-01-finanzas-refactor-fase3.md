# Refactor Finanzas — Fase 3 (frontend: dividir `useFinance.ts` y `types/domain.ts` + fix de invalidación) — Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dividir los dos barriles del frontend (`hooks/useFinance.ts` 569 líneas y `types/domain.ts` 624) en módulos por subdominio **sin cambiar comportamiento**, y aplicar la **única corrección declarada** del refactor: centralizar la invalidación de `clients`/`vendors` dentro de `invalidateFinance`.

**Architecture:** Estrategia de **barrel re-export** (la misma de Fase 2). `types/domain.ts` y `hooks/useFinance.ts` quedan como barriles que re-exportan desde los nuevos módulos focalizados, así los **43 archivos** que importan de `@/types/domain` y los **19** que importan de `@/hooks/useFinance` quedan intactos. Cada extracción mueve código VERBATIM; la verificación es typecheck + build de Vite limpios. La corrección de invalidación va en un commit propio al final (es el único cambio de comportamiento, declarado en la spec).

**Tech Stack:** React 18 + Vite + TypeScript + TanStack Query. Guardarraíl: `npm run lint` (= `tsc --noEmit`) y `npm run build`, ambos desde `frontend/`. No hay tests de frontend (por diseño de la spec); el backend NO se toca en esta fase.

**Rama:** `refactor/finanzas-fase3` creada desde `develop` actualizado.

**Commits:** terminar cada mensaje con
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Principio de oro (todas las tareas)

Tras cada extracción: `npm run lint` y `npm run build` DEBEN quedar limpios **sin modificar ningún archivo importador** (páginas, componentes, otros hooks). Si el typecheck falla, el movimiento quedó incompleto (símbolo sin exportar, import faltante) → arreglar el módulo nuevo o el barrel, nunca los importadores. Los barriles deben re-exportar EXACTAMENTE la misma superficie pública que hoy (en particular: `ContextRefs` hoy es privada de `domain.ts` y debe SEGUIR sin exportarse desde el barrel).

La única tarea que rompe esta regla es la **Task 3.10** (fix de invalidación), que modifica hooks ya extraídos y se declara como cambio de comportamiento.

---

## Mapa de destino

### `frontend/src/types/` (nuevos archivos)

- `core.ts` — jerarquía y módulos ejecutivos no financieros: `OrganizationType`, `EntityStatus`, `ProjectStatus`, `TaskStatus`, `Priority`, `TaskSource`, `Ref`, `Organization`, `OrganizationDetail`, `BusinessUnit`, `Project`, `ProjectDetail`, `Task`, `ContextRefs` (**exportada aquí** para que finance/sales la importen, pero NO re-exportada desde `domain.ts`), `DocumentType`, `DocumentStatus`, `DocumentRecord`, `DecisionStatus`, `StrategicDecision`.
- `sales.ts` — `SalesStatus`, `SalesSource`, `SalesOpportunity`, `SalesSummary`. Importa solo `ContextRefs` de `./core` (no necesita `Ref`: le llega vía herencia de `ContextRefs`).
- `banking.ts` — cuentas, movimientos, categorías bancarias e importaciones: `FinancialImportType`, `FinancialImportStatus`, `SalesImportSummary`, `BankAccount`, `BankTransactionsResponse`, `BankCategoryBreakdown`, `BankCategoryKind`, `RuleDirection`, `BankCategory`, `BankCategoryRule`, `BankMonthlyPoint`, `BankTransaction`, `ReconciliationCandidate`, `FinancialImportBatch`. Importa `Ref` de `./core`.
- `finance.ts` — libro de ingresos/gastos, partes y conciliación: `IncomeStatus`, `ExpenseStatus`, `DocumentKind`, `RecurrenceFrequency`, `IncomeRecord`, `ExpenseRecord`, `ClientStats`, `Client`, `ClientDetail`, `VendorStats`, `Vendor`, `VendorDetail`, `FinanceSummary`, `ReconciliationSummary`, `ConsolidatedOrg`, `ConsolidatedResponse`, `AutoReconcilePair`, `AutoReconcileResult`, `RecognizeTransfer`, `RecognizeTransfersResult`. Importa `Ref` y `ContextRefs` de `./core`.
- `dashboard.ts` — `DashboardSummary`. Importa `ProjectStatus`, `TaskStatus`, `OrganizationType`, `Priority`, `Ref`, `DocumentType` de `./core`, `FinanceSummary` de `./finance`, `SalesSummary` y `SalesOpportunity` de `./sales`.
- `domain.ts` — **barrel**: re-exports nombrados explícitos con `export type { ... } from './...'` (todos los símbolos actuales, SIN `ContextRefs`).

Orden de extracción por dependencias: `core` → `sales` → `banking` → `finance` → `dashboard`.

### `frontend/src/hooks/` (nuevos archivos)

- `finance-shared.ts` — `invalidateFinance` (movida VERBATIM, con `vendors` pero sin `clients`; el fix llega en la Task 3.10) y el tipo `FinanceFilters` (lo usan income y expenses).
- `useFinanceSummary.ts` — `useFinanceSummary`, `useConsolidated`.
- `useIncome.ts` — `useIncome`, `useIncomeMonths`, `useSaveIncome`, `useDeleteIncome`, `useRegisterPayment`.
- `useExpenses.ts` — `useExpenses`, `useExpenseMonths`, `useSaveExpense`, `useDeleteExpense`, `useRegisterExpensePayment`.
- `useBankImports.ts` — `useBankAccounts`, `useCreateBankAccount`, `useUpdateBankAccount`, `useBankTransactions`, `useBankTransactionMonths`, `useBankMonthly`, `useBankByCategory`, `useFinanceImportBatches`, `useFinanceImportPreview`, `useConfirmFinanceImport`, y los tipos `FinanceImportFilters`, `ImportPreviewInput`, `ImportPreviewRow`, `ImportPreviewResponse`, `BankTransactionFilters`.
- `useBankCategories.ts` — `useBankCategories`, `useSaveCategory`, `useDeleteCategory`, `useCategoryRules`, `useSaveRule`, `useDeleteRule`, `useReorderRules`, `useReapplyRules`, `useRulePreview`, `useBulkSetCategory`, `useSetTransactionCategory`, y la privada `invalidateRules`.
- `useReconciliation.ts` — `useReconciliationCandidates`, `useAutoReconcile`, `useRecognizeTransfers`.
- `useFinance.ts` — **barrel**: re-exporta hooks y tipos (misma superficie que hoy).

---

## Chunk A: `types/domain.ts`

### Task 3.0: Crear la rama de trabajo

- [ ] **Step 1** — `git checkout develop && git pull && git checkout -b refactor/finanzas-fase3`.
- [ ] **Step 2** — Sanity check del guardarraíl ANTES de tocar nada: `cd frontend && npm run lint && npm run build`. Expected: ambos limpios. Si algo falla aquí, detenerse y reportar (el problema no es de esta fase).

### Task 3.1: Extraer `types/core.ts`

**Files:** Create `frontend/src/types/core.ts`; Modify `frontend/src/types/domain.ts`.

- [ ] **Step 1** — Crear `core.ts` y MOVER verbatim desde `domain.ts`: `OrganizationType`, `EntityStatus`, `ProjectStatus`, `TaskStatus`, `Priority`, `TaskSource`, `Ref`, `Organization`, `OrganizationDetail`, `BusinessUnit`, `Project`, `ProjectDetail`, `Task`, `ContextRefs`, `DocumentType`, `DocumentStatus`, `DocumentRecord`, `StrategicDecision`, `DecisionStatus`. IMPORTANTE: `ContextRefs` hoy es `interface ContextRefs` (sin `export`); en `core.ts` pasa a `export interface ContextRefs` porque la necesitarán `finance.ts` y `sales.ts`. Conservar el comentario de cabecera del archivo en `domain.ts` y los comentarios de sección (`// ---- Sprint 2 ----`) donde correspondan.
- [ ] **Step 2** — En `domain.ts`: borrar esas definiciones y añadir al inicio los re-exports:

```ts
export type {
  OrganizationType, EntityStatus, ProjectStatus, TaskStatus, Priority, TaskSource,
  Ref, Organization, OrganizationDetail, BusinessUnit, Project, ProjectDetail, Task,
  DocumentType, DocumentStatus, DocumentRecord, DecisionStatus, StrategicDecision,
} from './core';
```

(sin `ContextRefs`). OJO: `export type { ... } from './core'` NO trae los identificadores al scope local de `domain.ts`, y los tipos que aún viven allí los usan. Añadir por tanto:

```ts
import type {
  ContextRefs, Ref, ProjectStatus, TaskStatus, OrganizationType, Priority, DocumentType,
} from './core';
```

(`ContextRefs`/`Ref` los usan `SalesOpportunity`, `IncomeRecord`, `FinanceSummary`, etc.; los 5 enums los usa `DashboardSummary`, que sigue local hasta la Task 3.5).

- [ ] **Step 3** — `cd frontend && npm run lint && npm run build`. Expected: limpios. `git status`: solo `types/core.ts` y `types/domain.ts`.
- [ ] **Step 4** — Commit: `refactor(front): extraer types/core (jerarquía + documentos/decisiones)`.

### Task 3.2: Extraer `types/sales.ts`

**Files:** Create `frontend/src/types/sales.ts`; Modify `frontend/src/types/domain.ts`.

- [ ] **Step 1** — Crear `sales.ts` y mover verbatim: `SalesStatus`, `SalesSource`, `SalesOpportunity`, `SalesSummary`. Añadir `import type { ContextRefs } from './core';` (`SalesOpportunity extends ContextRefs`; `SalesSummary` usa `SalesOpportunity`).
- [ ] **Step 2** — En `domain.ts`: borrar esas defs y añadir `export type { SalesStatus, SalesSource, SalesOpportunity, SalesSummary } from './sales';`. `DashboardSummary` (aún local) usa `SalesSummary`/`SalesOpportunity` → añadir `import type { SalesSummary, SalesOpportunity } from './sales';`.
- [ ] **Step 3** — lint + build limpios; `git status`: solo `types/sales.ts` y `types/domain.ts`.
- [ ] **Step 4** — Commit: `refactor(front): extraer types/sales`.

### Task 3.3: Extraer `types/banking.ts`

**Files:** Create `frontend/src/types/banking.ts`; Modify `frontend/src/types/domain.ts`.

- [ ] **Step 1** — Crear `banking.ts` y mover verbatim: `FinancialImportType`, `FinancialImportStatus`, `SalesImportSummary`, `BankAccount`, `BankTransactionsResponse`, `BankCategoryBreakdown`, `BankCategoryKind`, `RuleDirection`, `BankCategory`, `BankCategoryRule`, `BankMonthlyPoint`, `BankTransaction`, `ReconciliationCandidate`, `FinancialImportBatch`. Añadir `import type { Ref } from './core';` (`BankAccount.organization?`, `BankTransaction.organization?`, `FinancialImportBatch.organization?`). Conservar los comentarios inline (p. ej. `// Derivados del último movimiento…`, `// 'YYYY-MM'`, `// abonos − cargos`).
- [ ] **Step 2** — En `domain.ts`: borrar esas defs y añadir el re-export explícito de los 14 símbolos desde `./banking`.
- [ ] **Step 3** — lint + build limpios; `git status`: solo `types/banking.ts` y `types/domain.ts`.
- [ ] **Step 4** — Commit: `refactor(front): extraer types/banking (cuentas, movimientos, importaciones)`.

### Task 3.4: Extraer `types/finance.ts`

**Files:** Create `frontend/src/types/finance.ts`; Modify `frontend/src/types/domain.ts`.

- [ ] **Step 1** — Crear `finance.ts` y mover verbatim: `IncomeStatus`, `ExpenseStatus`, `DocumentKind`, `RecurrenceFrequency`, `IncomeRecord`, `ExpenseRecord`, `ClientStats`, `Client`, `ClientDetail`, `VendorStats`, `Vendor`, `VendorDetail`, `FinanceSummary`, `ReconciliationSummary`, `ConsolidatedOrg`, `ConsolidatedResponse`, `AutoReconcilePair`, `AutoReconcileResult`, `RecognizeTransfer`, `RecognizeTransfersResult`. Añadir `import type { ContextRefs, Ref } from './core';`.
- [ ] **Step 2** — En `domain.ts`: borrar esas defs y añadir el re-export explícito de los 20 símbolos desde `./finance`. Ajustar el `import type` de `./core` para que no queden imports sin uso (el typecheck los caza con `noUnusedLocals`): tras este paso solo queda `DashboardSummary` local, que usa `Ref, ProjectStatus, TaskStatus, OrganizationType, Priority, DocumentType` de core (ya no `ContextRefs`) más `FinanceSummary` (importarlo ahora de `./finance`) y `SalesSummary`/`SalesOpportunity` (de `./sales`).
- [ ] **Step 3** — lint + build limpios; `git status`: solo `types/finance.ts` y `types/domain.ts`.
- [ ] **Step 4** — Commit: `refactor(front): extraer types/finance (libro, partes, conciliación)`.

### Task 3.5: Extraer `types/dashboard.ts` y dejar `domain.ts` como barrel puro

**Files:** Create `frontend/src/types/dashboard.ts`; Modify `frontend/src/types/domain.ts`.

- [ ] **Step 1** — Crear `dashboard.ts` y mover verbatim `DashboardSummary`. Imports: `import type { ProjectStatus, TaskStatus, OrganizationType, Priority, Ref, DocumentType } from './core';`, `import type { FinanceSummary } from './finance';`, `import type { SalesSummary, SalesOpportunity } from './sales';`.
- [ ] **Step 2** — Reescribir `domain.ts` como barrel puro: solo el comentario de cabecera (actualizado para explicar que es un barrel de compatibilidad) + los `export type { ... } from './...'` de los cinco módulos. Sin `ContextRefs`. Verificar contra el `domain.ts` original (`git show develop:frontend/src/types/domain.ts`) que la lista re-exportada cubre TODOS los símbolos que hoy exporta.
- [ ] **Step 3** — lint + build limpios; `git status`: solo `types/dashboard.ts` y `types/domain.ts`. Ningún importador tocado: desde `frontend/`, `grep -rl "from '@/types/domain'" src | wc -l` sigue dando 43 y ninguno de esos archivos aparece en `git status`.
- [ ] **Step 4** — Commit: `refactor(front): types/domain pasa a barrel + types/dashboard`.

---

## Chunk B: `hooks/useFinance.ts`

### Task 3.6: Extraer `hooks/finance-shared.ts` + `hooks/useIncome.ts` + `hooks/useExpenses.ts`

**Files:** Create `frontend/src/hooks/finance-shared.ts`, `frontend/src/hooks/useIncome.ts`, `frontend/src/hooks/useExpenses.ts`; Modify `frontend/src/hooks/useFinance.ts`.

- [ ] **Step 1** — Crear `finance-shared.ts` con `invalidateFinance` movida VERBATIM (incluye `vendors`, NO incluye `clients` — el fix es la Task 3.10) y el tipo `FinanceFilters`:

```ts
import type { useQueryClient } from '@tanstack/react-query';

export type FinanceFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  category?: string;
  status?: string;
  isRecurring?: string;
  documentKind?: string;
  paymentState?: 'receivable' | 'payable' | 'overdue' | 'paid' | 'cancelled';
  month?: string;
};

export function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['income'] });
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['finance'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['vendors'] });
}
```

- [ ] **Step 2** — Crear `useIncome.ts` y mover verbatim `useIncome`, `useIncomeMonths`, `useSaveIncome`, `useDeleteIncome`, `useRegisterPayment` (con sus comentarios, incluida la invalidación manual de `['clients']` — se toca recién en 3.10). Imports: `useMutation`/`useQuery`/`useQueryClient` de `@tanstack/react-query`, `api`/`toQuery` de `@/lib/api`, `IncomeRecord` de `@/types/domain`, `invalidateFinance` y `FinanceFilters` de `./finance-shared`.
- [ ] **Step 3** — Crear `useExpenses.ts` y mover verbatim `useExpenses`, `useExpenseMonths`, `useSaveExpense`, `useDeleteExpense`, `useRegisterExpensePayment`. Imports análogos (`ExpenseRecord`).
- [ ] **Step 4** — En `useFinance.ts`: borrar todo lo movido (incluida la definición local de `invalidateFinance` y el tipo `FinanceFilters`) y añadir:

```ts
export { useIncome, useIncomeMonths, useSaveIncome, useDeleteIncome, useRegisterPayment } from './useIncome';
export { useExpenses, useExpenseMonths, useSaveExpense, useDeleteExpense, useRegisterExpensePayment } from './useExpenses';
export type { FinanceFilters } from './finance-shared';
```

Los hooks que siguen viviendo en `useFinance.ts` y llaman a `invalidateFinance` (confirm import, auto-reconcile, recognize transfers) pasan a importarla: `import { invalidateFinance } from './finance-shared';`. Limpiar del import de `@/types/domain` los tipos que ya no se usan localmente (`IncomeRecord`, `ExpenseRecord`).

- [ ] **Step 5** — lint + build limpios; `git status`: solo los 4 archivos previstos (ningún componente/página tocado).
- [ ] **Step 6** — Commit: `refactor(front): extraer useIncome/useExpenses + finance-shared (invalidateFinance)`.

### Task 3.7: Extraer `hooks/useFinanceSummary.ts` + `hooks/useBankCategories.ts`

**Files:** Create `frontend/src/hooks/useFinanceSummary.ts`, `frontend/src/hooks/useBankCategories.ts`; Modify `frontend/src/hooks/useFinance.ts`.

- [ ] **Step 1** — Crear `useFinanceSummary.ts` y mover verbatim `useFinanceSummary` y `useConsolidated`. Imports: `useQuery`, `api`/`toQuery`, `FinanceSummary`/`ConsolidatedResponse` de `@/types/domain`.
- [ ] **Step 2** — Crear `useBankCategories.ts` y mover verbatim `useBankCategories`, `useSaveCategory`, `useDeleteCategory`, `useCategoryRules`, la privada `invalidateRules` (con su comentario `// reaplica recategoriza movimientos`), `useSaveRule`, `useDeleteRule`, `useReorderRules`, `useReapplyRules`, `useRulePreview`, `useBulkSetCategory`, `useSetTransactionCategory`. Imports: `useMutation`/`useQuery`/`useQueryClient`, `api`/`toQuery`, `BankCategory`/`BankCategoryRule` de `@/types/domain`.
- [ ] **Step 3** — En `useFinance.ts`: borrar lo movido y añadir los re-exports:

```ts
export { useFinanceSummary, useConsolidated } from './useFinanceSummary';
export {
  useBankCategories, useSaveCategory, useDeleteCategory, useCategoryRules,
  useSaveRule, useDeleteRule, useReorderRules, useReapplyRules, useRulePreview,
  useBulkSetCategory, useSetTransactionCategory,
} from './useBankCategories';
```

Limpiar imports de tipos que queden sin uso.

- [ ] **Step 4** — lint + build limpios; `git status`: solo los 3 archivos previstos.
- [ ] **Step 5** — Commit: `refactor(front): extraer useFinanceSummary + useBankCategories`.

### Task 3.8: Extraer `hooks/useBankImports.ts`

**Files:** Create `frontend/src/hooks/useBankImports.ts`; Modify `frontend/src/hooks/useFinance.ts`.

- [ ] **Step 1** — Crear `useBankImports.ts` y mover verbatim: tipos `FinanceImportFilters`, `ImportPreviewInput`, `ImportPreviewRow`, `ImportPreviewResponse`, `BankTransactionFilters`; hooks `useBankAccounts`, `useCreateBankAccount`, `useUpdateBankAccount`, `useBankTransactions`, `useBankTransactionMonths`, `useBankMonthly`, `useBankByCategory`, `useFinanceImportBatches`, `useFinanceImportPreview`, `useConfirmFinanceImport` (este último conserva su `qc.invalidateQueries({ queryKey: ['clients'] })` manual hasta 3.10). Imports: `useMutation`/`useQuery`/`useQueryClient`, `api`/`toQuery`, `invalidateFinance` de `./finance-shared`, y de `@/types/domain`: `BankAccount`, `BankTransactionsResponse`, `BankMonthlyPoint`, `BankCategoryBreakdown`, `FinancialImportBatch`, `FinancialImportType`, `SalesImportSummary`.
- [ ] **Step 2** — En `useFinance.ts`: borrar lo movido y añadir:

```ts
export {
  useBankAccounts, useCreateBankAccount, useUpdateBankAccount,
  useBankTransactions, useBankTransactionMonths, useBankMonthly, useBankByCategory,
  useFinanceImportBatches, useFinanceImportPreview, useConfirmFinanceImport,
} from './useBankImports';
export type {
  FinanceImportFilters, ImportPreviewInput, ImportPreviewRow, ImportPreviewResponse,
  BankTransactionFilters,
} from './useBankImports';
```

Limpiar del import de `@/types/domain` los tipos que quedan sin uso local (`BankAccount`, `BankTransactionsResponse`, `BankMonthlyPoint`, `BankCategoryBreakdown`, `FinancialImportBatch`, `FinancialImportType`, `SalesImportSummary`) — con `noUnusedLocals` el lint falla si quedan.

- [ ] **Step 3** — lint + build limpios; `git status`: solo los 2 archivos previstos.
- [ ] **Step 4** — Commit: `refactor(front): extraer useBankImports (cuentas, movimientos, lotes de importación)`.

### Task 3.9: Extraer `hooks/useReconciliation.ts` + convertir `useFinance.ts` en barrel puro

**Files:** Create `frontend/src/hooks/useReconciliation.ts`; Modify `frontend/src/hooks/useFinance.ts` (→ barrel).

- [ ] **Step 1** — Crear `useReconciliation.ts` y mover verbatim `useReconciliationCandidates`, `useAutoReconcile`, `useRecognizeTransfers` (con sus comentarios sobre preview vs aplicar y sus invalidaciones manuales de `['clients']`, intactas hasta 3.10). Imports: `useMutation`/`useQuery`/`useQueryClient`, `api`/`toQuery`, `invalidateFinance` de `./finance-shared`, y `ReconciliationCandidate`/`AutoReconcileResult`/`RecognizeTransfersResult` de `@/types/domain`.
- [ ] **Step 2** — Reescribir `useFinance.ts` como barrel puro: solo los bloques de re-export acumulados en 3.6-3.8 más `export { useReconciliationCandidates, useAutoReconcile, useRecognizeTransfers } from './useReconciliation';`. Verificar contra `git show develop:frontend/src/hooks/useFinance.ts` que TODOS los símbolos exportados hoy (hooks y tipos) siguen exportados.
- [ ] **Step 3** — lint + build limpios; `git status`: solo los 2 archivos previstos. Ningún archivo de `pages/` ni `components/` modificado en toda la fase hasta aquí: `git diff --stat develop -- frontend/src/pages frontend/src/components` vacío.
- [ ] **Step 4** — Commit: `refactor(front): useFinance pasa a barrel + useReconciliation`.

---

## Chunk C: fix de invalidación + cierre

### Task 3.10: Corrección declarada — `clients` y `vendors` centralizados en `invalidateFinance`

**Files:** Modify `frontend/src/hooks/finance-shared.ts`, `frontend/src/hooks/useIncome.ts`, `frontend/src/hooks/useBankImports.ts`, `frontend/src/hooks/useReconciliation.ts`.

Este es el **único cambio de comportamiento** del refactor, declarado en la spec (Fase 3): hoy `invalidateFinance` invalida `vendors` pero no `clients`, y seis mutaciones añaden `['clients']` a mano. Se centralizan ambos.

- [ ] **Step 1** — En `finance-shared.ts`, añadir `clients` a `invalidateFinance` (queda: `income`, `expenses`, `finance`, `dashboard`, `clients`, `vendors`) con un comentario breve del porqué (las métricas de clientes/proveedores se derivan de sus documentos).
- [ ] **Step 2** — Quitar las invalidaciones manuales de `['clients']` que quedan redundantes (y los comentarios que las explicaban, ahora cubiertos por el comentario central):
  - `useIncome.ts`: en `useSaveIncome`, `useDeleteIncome` y `useRegisterPayment`.
  - `useBankImports.ts`: en `useConfirmFinanceImport`.
  - `useReconciliation.ts`: en `useAutoReconcile` y `useRecognizeTransfers`. Solo el comentario de `useAutoReconcile` menciona «invalida también clients» — ajustarlo para que siga siendo veraz (la invalidación viene ahora de `invalidateFinance`); el de `useRecognizeTransfers` no necesita cambios.
- [ ] **Step 3** — Verificar que la única invalidación literal de `['clients']` que queda en hooks es la centralizada: `grep -rn "\['clients'\]" frontend/src/hooks/` debe mostrar **exactamente 1 match, en `finance-shared.ts`** (`invalidateFinance`). Nota: `useClients.ts` NO matchea este patrón porque sus query keys son `['clients', 'list', ...]`/`['clients', 'detail', ...]` — eso es lo esperado.
- [ ] **Step 4** — lint + build limpios.
- [ ] **Step 5** — Commit: `fix(front): centralizar invalidación de clients/vendors en invalidateFinance`.

Efecto observable declarado: las mutaciones de gastos (`useSaveExpense`, `useDeleteExpense`, `useRegisterExpensePayment`) ahora también invalidan `clients`, y todas las mutaciones de ingresos invalidan `clients` de forma centralizada (antes solo algunas lo hacían a mano). Es un exceso de refetch inocuo y deseado.

### Cierre de Fase 3

- [ ] **Verificación final:** `cd frontend && npm run lint && npm run build` limpios. `git diff --stat develop -- backend` vacío (el backend no se tocó). `git diff --stat develop -- frontend/src/pages frontend/src/components frontend/src/lib` vacío (ningún importador tocado). `useFinance.ts` y `types/domain.ts` quedan como barriles finos; ningún módulo nuevo mezcla subdominios.
- [ ] **Smoke manual (opcional pero recomendado):** levantar backend + frontend y recorrer Finanzas (resumen, ingresos, gastos, bancos, importaciones, conciliación) verificando que carga sin errores de consola. Incluir específicamente el nuevo comportamiento: guardar/editar un gasto y visitar la página de clientes (ahora ese flujo refresca `clients`).
- [ ] **Handoff:** Fase 4 (UI genérica: `LedgerForm`/`LedgerTab`/`PartyListPage`/`PartyDetailPage` + `lib/paymentState.ts`) sigue pendiente con su propio plan.
