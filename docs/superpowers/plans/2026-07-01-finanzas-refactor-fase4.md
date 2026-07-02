# Refactor Finanzas — Fase 4 (frontend: UI genérica de libro y partes) — Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eliminar la duplicación de los gemelos de UI de Finanzas unificándolos en componentes genéricos parametrizados (`LedgerForm`, `LedgerTab`, `PartyListPage`, `PartyDetailPage`) + `lib/paymentState.ts`, dejando las páginas/tabs actuales como envoltorios delgados. Sin cambios de comportamiento observable.

**Architecture:** Por cada par de gemelos se crea UN componente genérico en `components/finance/` o `components/parties/`, y **en el mismo commit** los dos gemelos se reescriben como wrappers delgados que instancian el genérico con su configuración. Los wrappers **conservan su nombre y ubicación de export** (`IncomeForm`, `ClientsPage`, etc.), así que `App.tsx`, `FinancePage.tsx`, `IncomeTab`/`ExpensesTab` **no se tocan**. El markup se copia VERBATIM del gemelo (mismas clases Tailwind, mismos textos) y solo se parametrizan las diferencias tabuladas en cada task.

**Tech Stack:** React 18 + Vite + TypeScript + TanStack Query + Tailwind v4 (sin `tailwind.config`, tokens `var(--color-*)`). Guardarraíl: `npm run lint` (= `tsc --noEmit`, con `noUnusedLocals`) y `npm run build` (= `tsc --noEmit && vite build`), ambos desde `frontend/`. No hay tests de frontend: la verificación de comportamiento es typecheck + build + **smoke manual pantalla por pantalla** al cierre (criterio de salida de la spec).

**Rama:** `refactor/finanzas-fase4` desde `develop` actualizado.

**Commits:** terminar cada mensaje con
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Principio de oro (todas las tareas)

Tras cada task: `npm run lint` y `npm run build` limpios. El componente genérico + sus dos wrappers deben renderizar **exactamente el mismo DOM/markup** que los gemelos originales para cada configuración (mismos textos en español, mismas clases, mismas columnas, mismos handlers). Cualquier diferencia visible es un bug del refactor, no una mejora. `App.tsx` y `FinancePage.tsx` NO se modifican en ninguna task (se verifica con `git diff`). El backend NO se toca en toda la fase.

**Único matiz de nomenclatura permitido (interno, no observable):** en `PartyDetailPage`/`paymentState.ts` la clave de estado `'receivable'` del detalle de cliente se unifica con `'pending'` del de proveedor bajo una sola clave interna `'pending'`; los **labels visibles** siguen siendo "Por cobrar" (cliente) y "Pendiente" (proveedor) vía mapas separados. Es equivalencia observable, se declara aquí.

---

## Inventario de gemelos (fuente a unificar)

| Genérico | Ubicación nueva | Reemplaza | Divergencia |
|---|---|---|---|
| `LedgerForm` | `components/finance/LedgerForm.tsx` | `pages/finance/IncomeForm.tsx`, `ExpenseForm.tsx` | baja (>90% idénticos) |
| `LedgerTab` | `components/finance/LedgerTab.tsx` | `pages/finance/ReceivablesTab.tsx`, `PayablesTab.tsx` | baja-media (link de proveedor, total neto vs bruto) |
| `PartyListPage` | `components/parties/PartyListPage.tsx` | `pages/clients/ClientsPage.tsx`, `pages/vendors/VendorsPage.tsx` | media (métricas y columnas distintas) |
| `PartyDetailPage` | `components/parties/PartyDetailPage.tsx` | `pages/clients/ClientDetailPage.tsx`, `pages/vendors/VendorDetailPage.tsx` | **alta** (cliente es NC-aware) |
| `lib/paymentState.ts` | `lib/paymentState.ts` | `estadoCobro`/`estadoPago` inline en las detail pages | — |

Wrappers que conservan nombre/ubicación (NO se mueven, para no tocar rutas ni FinancePage): `IncomeForm`, `ExpenseForm`, `ReceivablesTab`, `PayablesTab`, `ClientsPage`, `VendorsPage`, `ClientDetailPage`, `VendorDetailPage`.

---

## Chunk A: `LedgerForm`

### Task 4.1: Crear `components/finance/LedgerForm.tsx` y reescribir `IncomeForm`/`ExpenseForm` como wrappers

**Files:** Create `frontend/src/components/finance/LedgerForm.tsx`; Modify `frontend/src/pages/finance/IncomeForm.tsx`, `frontend/src/pages/finance/ExpenseForm.tsx`.

Contexto: `IncomeForm.tsx` y `ExpenseForm.tsx` son >90% idénticos (léelos completos antes de empezar). Diferencias exactas:

| Aspecto | IncomeForm | ExpenseForm |
|---|---|---|
| prop del registro | `income?: IncomeRecord \| null` | `expense?: ExpenseRecord \| null` |
| hook de guardado | `useSaveIncome()` | `useSaveExpense()` |
| opciones de estado | `incomeStatusOptions` | `expenseStatusOptions` |
| estado por defecto | `'EXPECTED'` | `'PENDING'` |
| título | `Nuevo/Editar ingreso` | `Nuevo/Editar gasto` |
| campo parte (form key + label) | `clientName` / "Cliente" | `vendorName` / "Proveedor" |
| campo fecha (form key + label) | `incomeDate` / "Fecha de ingreso" | `expenseDate` / "Fecha del gasto" |
| placeholder categoría | "Ej: Consulta médica" | "Ej: Infraestructura" |
| label checkbox recurrente | "Ingreso recurrente" | "Gasto recurrente" |

Todo lo demás (estructura `Modal`→`form`, `ContextFields`, `toDate`, grid de campos, manejo de `error`, `handleSubmit` con `base`/`editing`/`organizationId`, botones) es idéntico.

- [ ] **Step 1** — Crear `LedgerForm.tsx` con una interfaz genérica. Define:
  ```ts
  type LedgerRecord = IncomeRecord | ExpenseRecord; // ambos comparten los campos usados salvo el de parte/fecha
  interface LedgerFormConfig {
    kind: 'income' | 'expense';
    title: { create: string; edit: string };
    partyField: { key: 'clientName' | 'vendorName'; label: string; value: string | null | undefined };
    dateField: { key: 'incomeDate' | 'expenseDate'; label: string; value: string | null | undefined };
    statusOptions: { value: string; label: string }[];
    defaultStatus: string;
    categoryPlaceholder: string;
    recurringLabel: string;
    save: ReturnType<typeof useSaveIncome> | ReturnType<typeof useSaveExpense>;
  }
  interface LedgerFormProps {
    open: boolean;
    onClose: () => void;
    record?: LedgerRecord | null;
    defaultOrganizationId?: string;
    config: LedgerFormConfig;
  }
  ```
  Copia el cuerpo VERBATIM de `IncomeForm` y sustituye las diferencias por `config`: el `form` state usa `[config.partyField.key]` y `[config.dateField.key]` como claves dinámicas (o guarda internamente `partyName`/`date` y mapea al payload por `config.partyField.key`/`config.dateField.key`); `status` inicial `record?.status ?? config.defaultStatus`; el `base` del payload escribe la clave de parte y de fecha según `config`. El `Modal title` usa `config.title.edit/create`. Los `Select`/labels/placeholders desde `config`. `save` viene por `config.save`. **No pierdas** el `lockOrganization={editing}`, el `recurrenceFrequency` condicionado a `isRecurring`, ni el bloque de `error`.
  Cabecera de archivo en español explicando que es el formulario genérico de libro (ingresos/gastos).
- [ ] **Step 2** — Reescribir `IncomeForm.tsx` como wrapper delgado: mantiene su `interface Props` actual (`open`, `onClose`, `income`, `defaultOrganizationId`) y su firma `export function IncomeForm(props)`, y retorna `<LedgerForm ... config={{ kind:'income', title:{create:'Nuevo ingreso',edit:'Editar ingreso'}, partyField:{key:'clientName',label:'Cliente',value:income?.clientName}, dateField:{key:'incomeDate',label:'Fecha de ingreso',value:income?.incomeDate}, statusOptions:incomeStatusOptions, defaultStatus:'EXPECTED', categoryPlaceholder:'Ej: Consulta médica', recurringLabel:'Ingreso recurrente', save:useSaveIncome() }} record={income} .../>`. NOTA: el hook `useSaveIncome()` debe llamarse en el wrapper (no dentro de un objeto condicional) para respetar las reglas de hooks; pásalo ya invocado en `config.save`.
- [ ] **Step 3** — Reescribir `ExpenseForm.tsx` como wrapper análogo (`kind:'expense'`, party `vendorName`/"Proveedor", date `expenseDate`/"Fecha del gasto", `expenseStatusOptions`, defaultStatus `'PENDING'`, placeholder "Ej: Infraestructura", recurringLabel "Gasto recurrente", `save:useSaveExpense()`, `record={expense}`).
- [ ] **Step 4** — `npm run lint` y `npm run build` limpios. `git status`: solo los 3 archivos. `git diff develop -- frontend/src/pages/finance/IncomeTab.tsx frontend/src/pages/finance/ExpensesTab.tsx` vacío (los tabs que montan estos forms no cambian, siguen pasando `income=`/`expense=`).
- [ ] **Step 5** — Commit: `refactor(front): unificar IncomeForm/ExpenseForm en LedgerForm`.

---

## Chunk B: `LedgerTab`

### Task 4.2: Crear `components/finance/LedgerTab.tsx` y reescribir `ReceivablesTab`/`PayablesTab` como wrappers

**Files:** Create `frontend/src/components/finance/LedgerTab.tsx`; Modify `frontend/src/pages/finance/ReceivablesTab.tsx`, `frontend/src/pages/finance/PayablesTab.tsx`.

Contexto: `ReceivablesTab.tsx` y `PayablesTab.tsx` (léelos completos) comparten estructura (barra de filtros estado+mes, `Card` con header+total, tabla, `ReconcileModal`). Diferencias exactas:

| Aspecto | ReceivablesTab | PayablesTab |
|---|---|---|
| icono | `Receipt` | `CreditCard` |
| hooks | `useIncome`, `useIncomeMonths`, `useRegisterPayment` | `useExpenses`, `useExpenseMonths`, `useRegisterExpensePayment` |
| estado inicial | `'receivable'` | `'payable'` |
| primer estado (value/label) | `receivable` / "Por cobrar" | `payable` / "Por pagar" |
| total por fila | `netAmount ?? amount` | `amount` |
| empty (sin empresa) | "…cuentas por cobrar." | "…cuentas por pagar." |
| spinner | "Cargando facturas…" | "Cargando gastos…" |
| empty tabla | "Sin facturas en este estado" | "Sin gastos en este estado" |
| columna "Emisión" (valor) | `formatDate(r.incomeDate)` | `formatDate(r.expenseDate)` |
| 1ª columna | "Cliente": **siempre texto plano** `{r.clientName ?? '—'}` (sin estilo especial) | "Proveedor": 3 estados — sin `vendorName` → `'—'`; con `vendorName` sin `vendorId` → `<span class="text-[var(--color-muted-foreground)]">`; con ambos → `<Link to=/proveedores/:vendorId class="text-[var(--color-primary)] hover:underline">` |
| 5ª columna (header/valor) | "Neto" / `netAmount ?? amount` | "Monto" / `amount` |
| `recordType` (ReconcileModal) | `'income'` | `'expense'` |
| record.name / record.amount | `clientName ?? '—'` / `netAmount ?? amount` | `vendorName ?? '—'` / `amount` |

Los estados 2-4 (overdue/paid/cancelled) y sus labels ("Vencidas"/"Pagadas"/"Anuladas") son idénticos; columnas Folio/Vence idénticas; acción Conciliar/Revertir idéntica; `onReconcile`/`onPayManual` idénticos.

**IMPORTANTE (tipado):** `IncomeRecord` y `ExpenseRecord` tienen campos exclusivos (`netAmount`/`clientName` solo en income; `vendorName`/`vendorId`/`expenseDate` solo en expense; `incomeDate` solo en income). Por eso `LedgerTabConfig` y `LedgerTab` deben ser **genéricos** sobre `T extends IncomeRecord | ExpenseRecord`, instanciados como `LedgerTabConfig<IncomeRecord>` en `ReceivablesTab` y `LedgerTabConfig<ExpenseRecord>` en `PayablesTab`. Si el config no fuera genérico, los accessors inferirían `T` como la unión y acceder a un campo exclusivo sería error de compilación (rompería el guardarraíl).

- [ ] **Step 1** — Crear `LedgerTab.tsx` **genérico**. Interfaz:
  ```ts
  import type { ReactNode } from 'react';
  import type { LucideIcon } from 'lucide-react';
  import type { UseQueryResult } from '@tanstack/react-query';
  import type { IncomeRecord, ExpenseRecord } from '@/types/domain';

  interface LedgerTabConfig<T extends IncomeRecord | ExpenseRecord> {
    recordType: 'income' | 'expense';
    icon: LucideIcon;
    estados: { value: string; label: string }[];                  // 4 estados; el 1º difiere
    initialEstado: string;
    listHook: (filters: { organizationId?: string; paymentState?: string; month?: string }) => UseQueryResult<T[]>;
    monthsHook: (organizationId?: string) => UseQueryResult<string[]>;
    registerHook: () => ReturnType<typeof useRegisterPayment>;     // firma idéntica en income/expense
    rowTotal: (r: T) => number;                                    // netAmount ?? amount | amount
    issueDate: (r: T) => string | null;                           // r.incomeDate | r.expenseDate (columna "Emisión")
    partyName: (r: T) => string;                                   // clientName ?? '—' | vendorName ?? '—' (para el ReconcileModal)
    renderPartyCell: (r: T) => ReactNode;                          // celda 1 VERBATIM del gemelo (preserva los 3 estados del proveedor)
    amountHeader: string;                                          // "Neto" | "Monto"
    emptyNoOrg: string;
    spinnerLabel: string;                                          // "Cargando facturas…" | "Cargando gastos…"
    emptyTable: string;
  }

  interface LedgerTabProps<T extends IncomeRecord | ExpenseRecord> {
    organizationId?: string;
    config: LedgerTabConfig<T>;
  }

  export function LedgerTab<T extends IncomeRecord | ExpenseRecord>({ organizationId, config }: LedgerTabProps<T>) { … }
  ```
  Copia el markup VERBATIM de `ReceivablesTab` como base. Parametriza: icono, textos, `estados`/`initialEstado`; invoca los hooks DENTRO de `LedgerTab` (`const { data: rows = [], isLoading, isError, error } = config.listHook({ organizationId, paymentState: estado, month })`, `const { data: months = [] } = config.monthsHook(organizationId)`, `const registrar = config.registerHook()`). La celda 1 se delega a `config.renderPartyCell(r)` (así cada wrapper reproduce su markup exacto: cliente texto plano; proveedor con sus 3 ramas). La columna "Emisión" usa `formatDate(config.issueDate(r))`. El total (encabezado y 5ª celda) usa `config.rowTotal`; el header `config.amountHeader`. El `ReconcileModal` recibe `recordType=config.recordType`, `record.name=config.partyName(reconciling)`, `record.amount=config.rowTotal(reconciling)`. Conserva Folio/Vence, acción Conciliar/Revertir, `onReconcile`/`onPayManual` idénticos.
  Cabecera en español.
- [ ] **Step 2** — Reescribir `ReceivablesTab.tsx` como wrapper: `export function ReceivablesTab({ organizationId }: { organizationId?: string })` que retorna `<LedgerTab<IncomeRecord> organizationId={organizationId} config={{ recordType:'income', icon:Receipt, estados:[{value:'receivable',label:'Por cobrar'},{value:'overdue',label:'Vencidas'},{value:'paid',label:'Pagadas'},{value:'cancelled',label:'Anuladas'}], initialEstado:'receivable', listHook:useIncome, monthsHook:useIncomeMonths, registerHook:useRegisterPayment, rowTotal:(r)=>r.netAmount ?? r.amount, issueDate:(r)=>r.incomeDate, partyName:(r)=>r.clientName ?? '—', renderPartyCell:(r)=> r.clientName ?? '—', amountHeader:'Neto', emptyNoOrg:'Elige una empresa arriba para ver sus cuentas por cobrar.', spinnerLabel:'Cargando facturas…', emptyTable:'Sin facturas en este estado' }} />`. La celda de cliente es texto plano (`{r.clientName ?? '—'}`), como hoy.
- [ ] **Step 3** — Reescribir `PayablesTab.tsx` como wrapper `<LedgerTab<ExpenseRecord> …>`: `recordType:'expense'`, `icon:CreditCard`, primer estado `{value:'payable',label:'Por pagar'}` (+ overdue/paid/cancelled iguales), `initialEstado:'payable'`, hooks de expenses (`useExpenses`/`useExpenseMonths`/`useRegisterExpensePayment`), `rowTotal:(r)=>r.amount`, `issueDate:(r)=>r.expenseDate`, `partyName:(r)=>r.vendorName ?? '—'`, `renderPartyCell` = las **3 ramas VERBATIM** de `PayablesTab` líneas 117-134 (sin `vendorName`→`'—'`; con nombre sin `vendorId`→`<span class="text-[var(--color-muted-foreground)]">`; con ambos→`<Link to={\`/proveedores/${r.vendorId}\`} class="text-[var(--color-primary)] hover:underline">`), `amountHeader:'Monto'`, textos de "cuentas por pagar"/"Cargando gastos…"/"Sin gastos en este estado".
- [ ] **Step 4** — lint + build limpios. `git status`: solo los 3 archivos. `git diff develop -- frontend/src/pages/finance/FinancePage.tsx` vacío.
- [ ] **Step 5** — Commit: `refactor(front): unificar ReceivablesTab/PayablesTab en LedgerTab`.

---

## Chunk C: `lib/paymentState.ts` + `PartyDetailPage`

### Task 4.3: Crear `lib/paymentState.ts`

**Files:** Create `frontend/src/lib/paymentState.ts`.

Contexto: hoy `ClientDetailPage` define `estadoCobro(inc)` con estados `paid/overdue/receivable/cancelled` y `VendorDetailPage` define `estadoPago(exp)` con `paid/overdue/pending/cancelled`. Las clases de color son idénticas; los labels difieren; la lógica de "cancelled" difiere (income: `netAmount===0`; expense: `status==='CANCELLED'`) y el 4º estado difiere (`receivable` vs `pending`).

- [ ] **Step 1** — Crear `paymentState.ts` con clave interna unificada y mapas/derivadores:
  ```ts
  import type { IncomeRecord, ExpenseRecord } from '@/types/domain';

  export type PaymentState = 'paid' | 'overdue' | 'pending' | 'cancelled';

  // Clases de color compartidas (idénticas en ambos gemelos hoy).
  export const PAYMENT_STATE_CLASS: Record<PaymentState, string> = {
    paid: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
    overdue: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
    pending: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
    cancelled: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
  };

  // Labels difieren entre cobro (cliente) y pago (proveedor).
  export const RECEIVABLE_LABEL: Record<PaymentState, string> = {
    paid: 'Pagada', overdue: 'Vencida', pending: 'Por cobrar', cancelled: 'Anulada',
  };
  export const PAYABLE_LABEL: Record<PaymentState, string> = {
    paid: 'Pagado', overdue: 'Vencido', pending: 'Pendiente', cancelled: 'Anulado',
  };

  // Estado de cobro de una factura (alineado con income.service paymentState):
  // anulada = netAmount 0; pagada = paidDate; vencida = dueDate pasado sin pago.
  export function deriveReceivableState(inc: IncomeRecord): PaymentState {
    if (inc.netAmount === 0) return 'cancelled';
    if (inc.paidDate) return 'paid';
    if (inc.dueDate && new Date(inc.dueDate) < new Date()) return 'overdue';
    return 'pending';
  }

  // Estado de pago de un gasto (alineado con expenses.service paymentState).
  export function derivePayableState(exp: ExpenseRecord): PaymentState {
    if (exp.status === 'CANCELLED') return 'cancelled';
    if (exp.paidDate) return 'paid';
    if (exp.dueDate && new Date(exp.dueDate) < new Date()) return 'overdue';
    return 'pending';
  }

  // Opciones de filtro (orden idéntico a los gemelos: paid, overdue, pending, cancelled).
  export const receivableStateOptions: { value: PaymentState; label: string }[] =
    (['paid','overdue','pending','cancelled'] as PaymentState[]).map((s) => ({ value: s, label: RECEIVABLE_LABEL[s] }));
  export const payableStateOptions: { value: PaymentState; label: string }[] =
    (['paid','overdue','pending','cancelled'] as PaymentState[]).map((s) => ({ value: s, label: PAYABLE_LABEL[s] }));
  ```
  Verifica contra los gemelos que labels y clases coinciden byte a byte (salvo el rename `receivable`→`pending`).
- [ ] **Step 2** — lint + build limpios (exports aún sin consumir es válido; `noUnusedLocals` solo aplica a locales, no a exports). `git status`: solo `lib/paymentState.ts`.
- [ ] **Step 3** — Commit: `refactor(front): extraer lib/paymentState (deriveState + labels/clases de cobro/pago)`.

### Task 4.4: Crear `components/parties/PartyDetailPage.tsx` y reescribir `ClientDetailPage`/`VendorDetailPage` como wrappers

**Files:** Create `frontend/src/components/parties/PartyDetailPage.tsx`; Modify `frontend/src/pages/clients/ClientDetailPage.tsx`, `frontend/src/pages/vendors/VendorDetailPage.tsx`.

Contexto: par de **alta divergencia** (léelos completos). `ClientDetailPage` es NC-aware: maneja `documentKind==='CREDIT_NOTE'` (columna "Tipo" con "NC"/"Factura", oculta estado/acción en NC, y el filtro de estado oculta NC), tiene columnas Bruto+Neto. `VendorDetailPage` no tiene NC (columna Monto, sin Tipo). Estructura común: back-link, `Spinner`/`ErrorState`, `PageHeader` (title=nombre, description=`rut · organization`), grid de 4 `MetricCard`, `Card` con header (icono `FileText` + "Documentos (N)" + búsqueda por folio + `Select` de estado), tabla filtrable, `EmptyState` sin resultados, `ErrorState` de `registrar`.

Diferencias exactas:

| Aspecto | ClientDetailPage | VendorDetailPage |
|---|---|---|
| detail hook | `useClientDetail(id)` | `useVendorDetail(id)` |
| pago hook | `useRegisterPayment()` | `useRegisterExpensePayment()` |
| registros | `client.incomes` | `vendor.expenses` |
| back-link | `/clientes` "Volver a clientes" | `/proveedores` "Volver a proveedores" |
| deriveState / label / options | `deriveReceivableState` / `RECEIVABLE_LABEL` / `receivableStateOptions` | `derivePayableState` / `PAYABLE_LABEL` / `payableStateOptions` |
| métricas (4) | Venta neta, Bruto facturado, Notas de crédito (tone si >0), Facturas | Total gastado, Pagado, Pendiente (tone si >0), Documentos |
| empty (sin docs) | "…no tiene facturas ni notas de crédito asociadas." | "…no tiene gastos asociados." |
| spinner | "Cargando cliente…" | "Cargando proveedor…" |
| NC-aware | **sí** (Tipo, Bruto+Neto, oculta Estado **y** Acción en NC, filtro oculta NC) | **no** (Monto; sin Tipo; Estado siempre visible, incluido "Anulado") |
| columnas tabla | Folio, Fecha, Tipo, Descripción, Bruto, Neto, Estado, Acción | Folio, Fecha, Descripción, Monto, Estado, Acción |
| fecha fila | `sourceIssueDate ?? incomeDate` | `sourceIssueDate ?? expenseDate` |

Filtro común: por `folio` (case-insensitive sobre `sourceFolio`) y por estado. En cliente, si hay estado seleccionado se ocultan las NC. Acción por fila: si `esNC`/cancelled → "—"; si `paidDate` → "Revertir" (`registrar.mutate({id, paidDate:null})`); si no → "Marcar pagada" (`registrar.mutate({id, paidDate:new Date().toLocaleDateString('en-CA')})`).

- [ ] **Step 1** — Crear `PartyDetailPage.tsx` genérico. Interfaz sugerida (parametriza lo divergente; el markup común se copia verbatim del gemelo de cliente, que es el superset):
  ```ts
  interface DocColumn<T> { header: string; align?: 'right'; render: (row: T) => ReactNode; }
  interface PartyDetailConfig<E, R> {
    detailHook: (id?: string) => UseQueryResult<E>;
    register: ReturnType<typeof useRegisterPayment>;      // invocado en el wrapper
    backLink: { to: string; label: string };
    header: (entity: E) => { title: string; description: string };
    metrics: (entity: E) => ReactNode;                    // 4 <MetricCard/>
    records: (entity: E) => R[];
    emptyDocs: string;                                    // texto EmptyState sin documentos
    deriveState: (row: R) => PaymentState;
    stateLabel: Record<PaymentState, string>;
    stateOptions: { value: PaymentState; label: string }[];
    isCreditNote?: (row: R) => boolean;                   // solo cliente; oculta la celda ESTADO y (en cliente) la ACCIÓN
    filterHidesCreditNotesOnState?: boolean;              // true en cliente: al filtrar por estado, ocultar NC
    matchFolio: (row: R) => string | null;                // sourceFolio
    columns: DocColumn<R>[];                              // definición declarativa de las celdas de DATOS (no Estado/Acción)
    isCancelled: (row: R) => boolean;                     // oculta solo la ACCIÓN: esNC (cliente) | status==='CANCELLED' (proveedor)
    rowId: (row: R) => string;
    spinnerLabel: string;                                 // "Cargando cliente…" | "Cargando proveedor…"
  }
  ```
  Implementa la lógica común: `useParams` id, estado `folio`/`estadoFiltro`, `documentos = useMemo(...)` con el filtro de folio + estado (aplicando `filterHidesCreditNotesOnState`+`isCreditNote`), el `Card`/header/búsqueda/`Select`, la tabla que itera `columns` para las celdas de datos y añade **Estado** y **Acción**.
  **Reglas de ocultamiento (predicados INDEPENDIENTES — no colapsar):**
  - Celda **Estado**: se oculta (`—`) SOLO si `config.isCreditNote?.(row)` es true. En proveedor no hay `isCreditNote`, así que el `Badge` (incluido "Anulado" para `status==='CANCELLED'`) **siempre se muestra** — replica `VendorDetailPage` líneas 177-181, donde el badge nunca desaparece.
  - Celda **Acción**: se oculta (`—`) si `config.isCancelled(row)` es true; si no, botón Revertir (si `paidDate`) o Marcar pagada. En cliente `isCancelled`=esNC (oculta acción en NC); en proveedor `isCancelled`=`status==='CANCELLED'`.
  - En el cliente ambos predicados apuntan a la misma condición (`documentKind==='CREDIT_NOTE'`), pero son campos distintos del config; NO uses `isCancelled` para ocultar Estado (regresaría el badge "Anulado" del proveedor).
  Las celdas de datos (Folio, Fecha, Tipo, Descripción, Bruto/Neto/Monto) vienen por `config.columns` (usan `deriveState`/`stateLabel`/`PAYMENT_STATE_CLASS` solo en la celda Estado gestionada por el genérico). Conserva textos "Documentos (N)", "Buscar por folio…", "Todos los estados", "Sin resultados", los comentarios sobre fecha LOCAL en el botón, el `Spinner label={config.spinnerLabel}` y el `registrar.isError`.
  Cabecera en español.
  > Si al implementar ves que la parametrización NC-aware hace el genérico difícil de sostener en un solo archivo legible, repórtalo como DONE_WITH_CONCERNS con la alternativa (p. ej. render-prop para la fila completa) — no lo dividas por tu cuenta sin avisar.
- [ ] **Step 2** — Reescribir `ClientDetailPage.tsx` como wrapper: `export function ClientDetailPage()` que instancia `<PartyDetailPage config={...}>` con `detailHook:useClientDetail`, `register:useRegisterPayment()`, backLink `/clientes`, métricas de cliente (Venta neta/Bruto/NC/Facturas), `records:(c)=>c.incomes`, `deriveState:deriveReceivableState`, `stateLabel:RECEIVABLE_LABEL`, `stateOptions:receivableStateOptions`, `isCreditNote:(r)=>r.documentKind==='CREDIT_NOTE'`, `filterHidesCreditNotesOnState:true`, `columns` = [Folio, Fecha(`sourceIssueDate??incomeDate`), Tipo(`esNC?'NC':'Factura'`), Descripción, Bruto(`amount`), Neto(`netAmount??amount`)], `isCancelled:(r)=>r.documentKind==='CREDIT_NOTE'`, header `${name}`/`${rut} · ${org}`. Importa los helpers de `@/lib/paymentState`.
- [ ] **Step 3** — Reescribir `VendorDetailPage.tsx` como wrapper análogo (proveedor, sin NC): `detailHook:useVendorDetail`, `register:useRegisterExpensePayment()`, backLink `/proveedores`, métricas (Total gastado/Pagado/Pendiente/Documentos), `records:(v)=>v.expenses`, `deriveState:derivePayableState`, `stateLabel:PAYABLE_LABEL`, `stateOptions:payableStateOptions`, sin `isCreditNote`/`filterHidesCreditNotesOnState`, `columns` = [Folio, Fecha(`sourceIssueDate??expenseDate`), Descripción, Monto(`amount`)], `isCancelled:(r)=>r.status==='CANCELLED'`.
- [ ] **Step 4** — lint + build limpios. `git status`: solo los 3 archivos. `git diff develop -- frontend/src/App.tsx` vacío. Verifica que ya no quedan `estadoCobro`/`estadoPago` inline: `grep -rn "estadoCobro\|estadoPago" frontend/src` sin resultados.
- [ ] **Step 5** — Commit: `refactor(front): unificar ClientDetailPage/VendorDetailPage en PartyDetailPage`.

---

## Chunk D: `PartyListPage`

### Task 4.5: Crear `components/parties/PartyListPage.tsx` y reescribir `ClientsPage`/`VendorsPage` como wrappers

**Files:** Create `frontend/src/components/parties/PartyListPage.tsx`; Modify `frontend/src/pages/clients/ClientsPage.tsx`, `frontend/src/pages/vendors/VendorsPage.tsx`.

Contexto: gemelos de divergencia media (léelos completos). Estructura común: `PageHeader`, grid de métricas condicionado a `data.length>0`, `Card` de filtros (`OrganizationFilter` + `Input` de búsqueda), `Spinner`/`ErrorState`/`EmptyState`, `Card` con tabla de filas clicables (navegan al detalle). Diferencias:

| Aspecto | ClientsPage | VendorsPage |
|---|---|---|
| lista hook + filtros | `useClients`, `ClientFilters` | `useVendors`, `VendorFilters` |
| icono | `Users` | `Truck` |
| título / descripción | "Clientes" / "Cartera consolidada por empresa, generada al importar ventas." | "Proveedores" / "…importar compras." |
| ruta detalle | `/clientes/:id` | `/proveedores/:id` |
| métricas | 4 (Clientes, Venta neta total, Por cobrar[warning], Notas de crédito[warning]) grid `sm:grid-cols-2 lg:grid-cols-4` | 3 (Proveedores, Total gastado, Pendiente[warning]) grid `sm:grid-cols-3` |
| columnas | 10 (Cliente[nombre+rut], Empresa, Facturas, NC, Bruto facturado, Notas de crédito, Venta neta, Cobrado, Por cobrar[valor+**clase** condicional], Último documento) | 6 (Proveedor[nombre+rut], Empresa, Documentos, Total gastado, Pendiente[solo **valor** condicional, sin clase], Último documento) |
| empty | "Sin clientes" + texto ventas | "Sin proveedores" + texto compras |

> Nota: la celda "Por cobrar" de clientes tiene valor condicional **y** clase de color condicional (`font-medium text-[var(--color-warning)]` si `pendingAmount>0`); la de "Pendiente" de proveedores solo tiene valor condicional (sin cambio de clase). Copia cada `render` VERBATIM del gemelo respectivo — no las iguales.

- [ ] **Step 1** — Crear `PartyListPage.tsx` genérico:
  ```ts
  interface Column<T> { header: string; align?: 'right'; render: (row: T) => ReactNode; }
  interface PartyListConfig<T extends { id: string }, F> {
    listHook: (filters: F) => UseQueryResult<T[]>;
    icon: LucideIcon;
    title: string;
    description: string;
    routeTo: (row: T) => string;                 // `/clientes/${id}` | `/proveedores/${id}`
    metrics: (rows: T[]) => ReactNode;           // grid de MetricCard (incluye su propio grid className)
    columns: Column<T>[];
    empty: { title: string; body: ReactNode };
    searchPlaceholder?: string;                  // "Buscar por razón social o RUT" (igual en ambos)
  }
  ```
  Implementa la estructura común: estado `filters`, `set(key,value)`, `useNavigate`, `OrganizationFilter` (bindeado a `filters.organizationId`), `Input` de búsqueda (a `filters.search`), render de `metrics(data)` cuando `data.length>0`, tabla que itera `config.columns` y filas con `onClick`/`onKeyDown`/`tabIndex`/clases de hover navegando a `config.routeTo(row)`. Como `ClientFilters` y `VendorFilters` son idénticos estructuralmente (`{organizationId?, search?}`), usa un tipo `PartyFilters = { organizationId?: string; search?: string }` interno para el estado.
  Cabecera en español.
- [ ] **Step 2** — Reescribir `ClientsPage.tsx` como wrapper: métricas = las 4 actuales dentro de su grid `sm:grid-cols-2 lg:grid-cols-4` (usa `data`/`totalNet`/`totalPending`/`totalCreditNotes` calculados dentro de la función `metrics`), `columns` = las 10 columnas actuales (copia el `render` de cada celda verbatim, incluida la de "Por cobrar" con clase condicional y la de NC con `formatMoney(-...)`), `routeTo:(c)=>\`/clientes/${c.id}\``, icono `Users`, textos y empty de clientes, `listHook:useClients`.
- [ ] **Step 3** — Reescribir `VendorsPage.tsx` como wrapper análogo: métricas = las 3 actuales en grid `sm:grid-cols-3`, `columns` = las 6 actuales, `routeTo:(v)=>\`/proveedores/${v.id}\``, icono `Truck`, textos/empty de proveedores, `listHook:useVendors`.
- [ ] **Step 4** — lint + build limpios. `git status`: solo los 3 archivos. `git diff develop -- frontend/src/App.tsx` vacío.
- [ ] **Step 5** — Commit: `refactor(front): unificar ClientsPage/VendorsPage en PartyListPage`.

---

## Cierre de Fase 4

- [ ] **Verificación estática:** `cd frontend && npm run lint && npm run build` limpios. `git diff --stat develop -- backend` vacío. `git diff --stat develop -- frontend/src/App.tsx frontend/src/pages/finance/FinancePage.tsx frontend/src/pages/finance/IncomeTab.tsx frontend/src/pages/finance/ExpensesTab.tsx` vacío (contenedores/rutas intactos). Confirmar que existen los 5 genéricos nuevos y que los 8 gemelos quedaron como wrappers delgados.
- [ ] **Smoke manual (criterio de salida de la spec — obligatorio):** levantar Docker + backend (`npm run dev`) + frontend (`npm run dev`) y recorrer, verificando ausencia de errores de consola y paridad visual con el comportamiento previo:
  - **Ingresos**: crear, editar, eliminar; abrir el form (título/campos/estado por defecto correctos).
  - **Gastos**: crear, editar, eliminar.
  - **Por cobrar**: filtros de estado + mes, total (neto), Conciliar (modal) y Revertir.
  - **Por pagar**: ídem, con link a proveedor y total (bruto).
  - **Clientes**: lista (métricas + 10 columnas), detalle (NC-aware: tipo, filtro que oculta NC, Marcar pagada/Revertir).
  - **Proveedores**: lista (3 métricas + 6 columnas), detalle (Marcar pagada/Revertir). **Incluir un gasto en estado `CANCELLED`** y confirmar que el badge "Anulado" sigue visible en la columna Estado (solo la Acción muestra "—").
- [ ] **Handoff:** cerrar el refactor de Finanzas (Fases 0-4 completas). Actualizar la memoria del proyecto.
