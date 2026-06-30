# Consolidación de Finanzas — cuadre, auto-conciliación y vista unificada

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama sugerida:** `feat/finanzas-consolidacion-cuadre`
**Roadmap:** Pieza **②** de la fase operativa de Finanzas (① categorización a escala ✅ → **②
conciliación + cuadre + vista unificada** → ③ reportes ejecutivos). Ver memoria
`finanzas-consolidacion-roadmap`.

## Contexto y problema

El CEO cargó 5 meses de libros (ventas/compras) y cartolas, y ya tiene la categorización a escala
(pieza ①). Ahora las tres fuentes viven como islas:

- **Cuentas por cobrar** = facturas emitidas a clientes (devengado, del libro de ventas).
- **Cuentas por pagar** = facturas de proveedores (devengado, del libro de compras).
- **Bancos** = la plata real que entró/salió (caja, de las cartolas).

La conciliación banco↔factura existe pero es **100% manual, factura por factura** vía
`ReconcileModal` (un registro a la vez). No hay forma de cruzar en lote, ni de ver qué movimientos
quedaron sin enlazar, ni una pantalla que junte todo. Además, el "Por cobrar/Por pagar" se calcula
**duplicado** en `getSummary` y `getFinancePosition`.

**Objetivo (lo que pidió el CEO):**
1. **Auto-conciliar a escala** los cruces **inequívocos** (banco↔facturas/gastos), conservando lo
   dudoso para el modal manual.
2. Una **pantalla consolidada** que junte posición, cuadre del mes y por cobrar/pagar.
3. (Acotación del CEO) Mostrar el **proveedor (razón social)** en la tabla de Gastos — dato que ya
   se importa pero no se muestra; ayuda a conciliar.

## Decisiones de diseño

- **Estado de conciliación DERIVADO al leer** (no se persiste): un movimiento bancario está
  *conciliado* si alguna factura/gasto lo referencia vía `paidByBankTransactionId`. La relación
  inversa (`BankTransaction.paidIncomes` / `paidExpenses`) **ya existe en el schema pero nunca se
  consulta**; este trabajo la usa. **Cero columnas nuevas, cero migración.**
- **Auto-conciliación conservadora (solo lo inequívoco):** se enlaza automáticamente solo cuando
  hay **exactamente una** factura sin pagar y **exactamente un** movimiento sin enlazar del mismo
  monto, misma empresa, dirección correcta y dentro de una ventana de fecha. Cualquier ambigüedad
  (montos repetidos, varios candidatos) **no se toca** y queda para el modal manual. Cero falsos
  positivos.
- **Endpoint consolidado único** que elimina la duplicación: un helper compartido calcula
  por-cobrar/por-pagar, reusado por `getSummary` y por el nuevo `getConsolidated`.
- **Guardrail de monto (visible, no bloqueante):** el cuadre expone el descalce; el modal manual
  avisa cuando el monto del movimiento ≠ el de la factura (comisiones/pagos parciales pueden
  diferir legítimamente).
- **Ventana de fecha generosa** (±60 días entre el movimiento y la fecha de la factura) para no
  bloquear pagos que caen al mes siguiente, evitando calces coincidentes de meses muy lejanos.
- **Sin cambios de dominio:** sin pagos parciales (todo o nada, decisión previa), sin
  auto-conciliación N:1 por suma (sigue siendo manual: enlazar el mismo movimiento a varias
  facturas una por una, ya soportado por el modelo).

## Modelo de datos

**Sin cambios de schema.** Se usa la relación existente:
- `IncomeRecord.paidByBankTransactionId` / `ExpenseRecord.paidByBankTransactionId` (FK del lado de
  la factura/gasto).
- Las inversas `BankTransaction.paidIncomes: IncomeRecord[]` y `paidExpenses: ExpenseRecord[]` (ya
  declaradas en `schema.prisma`, hoy sin uso) — se consultan por primera vez aquí.
- `ExpenseRecord.vendorName` / `vendorId` (ya poblados por el import: `finance-imports.parser.ts`
  mapea `RAZON SOCIAL` → `vendorName`).

## Backend

Patrón del proyecto: `routes → controller (Zod .parse) → service (Prisma)`, respuestas `{ data }`,
errores vía `utils/http-error.ts`. Todo bajo el módulo `finance` salvo lo de la lista de
movimientos, que vive en `finance-imports`.

### 0. Semántica del "mes" (resuelve la ambigüedad de alcance)

Hay dos naturalezas distintas y NO deben confundirse:
- **Posición** (caja, por cobrar, por pagar, posición): es una **foto al día de hoy** (saldos y
  saldos pendientes). **No se filtra por mes** — siempre es el snapshot actual, como el
  `getFinancePosition` de hoy.
- **Cuadre y auto-conciliación**: sí son **por mes** (o "todos"). El Consolidado gana un **selector
  de mes** (componente `MonthFilter` ya existente + lista de meses de `useBankTransactionMonths`),
  con opción **"Todos los meses"** (valor vacío). Ese mes alimenta el bloque Cuadre y el modal de
  auto-conciliación; **no** afecta las tarjetas de posición.

Por eso `getConsolidated` recibe `month?` opcional: las tarjetas de posición lo ignoran; solo el
sub-objeto `reconciliation` (cuadre) se calcula para ese mes (o todos si se omite). El título del
bloque se adapta ("Cuadre de mayo" / "Cuadre — todos los meses").

### 1. Helpers compartidos (`finance.service.ts`)

Extraer a helpers privados la lógica hoy **duplicada/inline**:
- `computeReceivablePayable(organizationId?)` → `{ receivable, payable, byOrganization }` (hoy
  repetido idéntico en `getSummary` y `getFinancePosition`).
- `computeOverdue(organizationId?)` → `{ overdueReceivable:{amount,count}, overduePayable:{amount,count} }`
  (hoy **inline** dentro de `getSummary`; `getConsolidated` lo necesita, así que se extrae para no
  duplicarlo).

Los reusan `getSummary` y `getConsolidated`. **No cambian los números**, solo eliminan duplicación.

### 2. Cuadre del mes (`getReconciliationSummary`)

`getReconciliationSummary({ organizationId?, month? })` → para la empresa/mes:
- **Abonos** (`creditAmount > 0`): `total`, `conciliado` (suma de abonos que tienen al menos un
  `IncomeRecord` enlazado), `suelto` (= total − conciliado).
- **Cargos** (`chargeAmount > 0`): `total`, `conciliado` (con `ExpenseRecord` enlazado), `suelto`.
- `unlinkedCount`: nº de movimientos sin ninguna factura/gasto enlazado (en el mes/empresa).

Implementación: un `bankTransaction.findMany` filtrado por org+mes (rango `transactionDate` como en
`listBankTransactions`) con `include: { _count: { select: { paidIncomes: true, paidExpenses: true } } }`,
y se agregan los totales en JS (cientos de filas, aceptable). Un movimiento cuenta como conciliado
si `_count.paidIncomes > 0` (para abonos) o `_count.paidExpenses > 0` (para cargos).

### 3. Endpoint consolidado (`getConsolidated`)

`getConsolidated({ organizationId?, month? })` → reemplaza/renombra a `getFinancePosition` y agrega
el cuadre. Devuelve:
```
{
  cash, receivable, payable, position,            // posición (cash = saldo banco; resto del helper)
  overdueReceivable: { amount, count },
  overduePayable:    { amount, count },
  byOrganization: [{ organizationId, name, cash, receivable, payable, position }],
  reconciliation: { credits:{total,conciliado,suelto}, charges:{...}, unlinkedCount }, // §2
}
```
- `cash` por empresa: el saldo bancario corrido (LATERAL último `balance` por cuenta), igual que el
  `getFinancePosition` actual. **No** se filtra por mes (foto actual).
- `receivable`/`payable`: del helper `computeReceivablePayable` (§1). **No** se filtra por mes.
- `overdue*`: del helper `computeOverdue` (§1). **No** se filtra por mes.
- `reconciliation`: del §2, **sí** filtrado por el `month` recibido (o todos si se omite).
- Rutas: `GET /finance/consolidated` (query `organizationId?`, `month?`). Mantener
  `GET /finance/summary` para las pestañas de detalle. Eliminar `GET /finance/position` y
  `getFinancePosition` (lo absorbe `getConsolidated`). **Barrer** lo que quede sin uso tras
  removerlo: tipos `FinancePosition`/`FinancePositionOrg` (`types/domain.ts`) y, si aplica, el
  import de `Prisma` en `finance.service.ts`, para que el typecheck quede limpio.

### 4. Auto-conciliación (`autoReconcile`)

`autoReconcile({ organizationId, month?, apply })` → enlaza los pares **inequívocos** y devuelve el
conteo. `organizationId` es **requerido** (la auto-conciliación corre por empresa). `month` es
**opcional**: si viene, acota las facturas candidatas a ese mes; si se omite ("todos"), considera
todas las no pagadas. Hay un **modo preview** (`apply:false`, no escribe) y un **modo aplicar**
(`apply:true`):

Algoritmo (por dirección, dos pasadas: income/credit y expense/charge):
1. **Facturas candidatas** (income): `paidDate = null`, `netAmount > 0` (no NC ni anuladas), de la
   empresa; **si hay `month`**, con fecha de emisión (`sourceIssueDate ?? incomeDate`) dentro de ese
   rango. `target = netAmount ?? amount`. (Expense: `status != CANCELLED`, `paidDate = null`,
   `target = amount`.)
2. **Movimientos candidatos**: de la empresa, dirección correcta (`creditAmount > 0` para income /
   `chargeAmount > 0` para expense), **sin enlazar** (`_count.paidIncomes === 0` resp.
   `paidExpenses === 0`).
3. Agrupar facturas por `target` y movimientos por su monto (`creditAmount`/`chargeAmount`).
4. Para cada monto donde **hay exactamente una factura candidata y exactamente un movimiento
   candidato** y el movimiento está dentro de **±60 días** de la fecha de la factura
   (`incomeDate ?? dueDate`) → es un **par inequívoco**.
5. **Aplicar** (si `apply`): por cada par, en una `$transaction`, setear en la factura/gasto
   `paidByBankTransactionId = mov.id`, `paidDate = mov.transactionDate`, `status = PAID`
   (reusando exactamente la misma escritura que `registerPayment`).

Devuelve `{ pairs: <n>, linkedIncome, linkedExpense, ambiguousAmounts: <n> }` (en preview, `pairs`
= cuántos se enlazarían; en aplicar, cuántos se enlazaron). **Idempotente**: como solo considera
facturas no pagadas y movimientos sin enlazar, re-ejecutar solo toma lo nuevo y nunca pisa lo
manual (que ya tiene `paidDate`).
- Rutas: `POST /finance/reconciliation/auto` con body `{ organizationId, month, apply: boolean }`.

### 5. Estado de conciliación en la lista de movimientos (`finance-imports`)

- `listBankTransactions` (`finance-imports.service.ts`): agregar al `include` el
  `_count: { select: { paidIncomes: true, paidExpenses: true } }` y exponer en cada fila
  `reconciled: boolean` (= algún count > 0). Agregar al schema/filtros un parámetro opcional
  `reconciliation: 'linked' | 'unlinked'` que filtra con `where` sobre las relaciones
  (`paidIncomes: { some: {} }` / `none`, combinado con `paidExpenses`). Sentinela en la query como
  los otros filtros.

## Frontend

Datos solo vía `lib/api.ts` + hooks React Query con invalidación en `onSuccess`.

### 6. Tipos (`types/domain.ts`)
```ts
export interface ReconciliationSummary {
  credits: { total: number; conciliado: number; suelto: number };
  charges: { total: number; conciliado: number; suelto: number };
  unlinkedCount: number;
}
export interface ConsolidatedResponse {
  cash: number; receivable: number; payable: number; position: number;
  overdueReceivable: { amount: number; count: number };
  overduePayable: { amount: number; count: number };
  byOrganization: { organizationId: string; name: string; cash: number; receivable: number; payable: number; position: number }[];
  reconciliation: ReconciliationSummary;
}
export interface AutoReconcileResult { pairs: number; linkedIncome: number; linkedExpense: number; ambiguousAmounts: number; }
```
- En `BankTransaction`: agregar `reconciled: boolean`.
- `ExpenseRecord` ya tiene `vendorName` / `vendorId` (no cambia).

### 7. Hooks (`hooks/useFinance.ts`)
- `useConsolidated(filters: { organizationId?; month? })` → `GET /finance/consolidated`, key
  `['finance','consolidated', filters]`. **Reemplaza** `useFinancePosition`.
- `useAutoReconcile()` → `POST /finance/reconciliation/auto`. En `onSuccess` del modo **aplicar**:
  llamar `invalidateFinance(qc)` **y además** `qc.invalidateQueries({ queryKey: ['finance-imports'] })`
  (mismo patrón que `useRegisterPayment`, que invalida finance + finance-imports + clients). El
  **preview** (`apply:false`) NO invalida.
- `reconciliation?` añadido a los filtros de `useBankTransactions` (viaja por `toQuery`).

### 8. Consolidado / Resumen (`ConsolidatedPosition.tsx` + `FinanceSummaryTab.tsx` + `FinancePage.tsx`)
- **Selector de mes**: `FinancePage` gana estado `consolidatedMonth` (string | undefined) y un
  `MonthFilter` en la cabecera del Resumen (lista de `useBankTransactionMonths(organizationId)`),
  con "Todos los meses" = vacío. Default: el **mes más reciente con datos** (primero de la lista).
  Se pasa como prop a `ConsolidatedPosition`.
- `ConsolidatedPosition` consume `useConsolidated({ organizationId, month })` (en vez de
  `useFinancePosition`). Las 4 tarjetas de posición son foto actual; debajo agrega el bloque
  **Cuadre** (título según el mes): dos filas (Abonos / Cargos) con total · conciliado · suelto, y
  una línea "⚠ N movimientos sin enlazar" con botón **[revisar]**.
- **Deep-link [revisar]**: `FinancePage` expone una función que hace `setTab('banks')` y fija un
  estado `banksInitialFilter = 'unlinked'`, pasado a `BanksTab` como prop nueva
  `initialReconciliation?: 'linked' | 'unlinked'` (que `BanksTab` usa como valor inicial de su
  filtro local de conciliación). `ConsolidatedPosition` recibe esa función por prop y la llama
  desde [revisar].
- Botón **[Auto-conciliar exactos]**: abre `AutoReconcileModal` (§9) con la empresa + el mes
  seleccionado.
- `FinanceSummaryTab` deja de mostrar "Por cobrar/Cobrado/Gastos pendientes" duplicados (ya viven
  en el bloque de posición); conserva resultado del mes, por empresa, vencidos, categorías y
  próximos vencimientos.

### 9. Modal de auto-conciliación (`AutoReconcileModal.tsx`, nuevo)
- Recibe `organizationId` y `month` (el seleccionado en el Consolidado; puede ser "todos" = sin
  mes). Al abrir, llama `useAutoReconcile` en modo **preview** (`apply:false`) y muestra: *"Se
  enlazarán N pares exactos; M montos quedan ambiguos para revisar a mano."*
- Botón **Confirmar** → llama en modo **aplicar** (`apply:true`); al éxito muestra el conteo
  enlazado y cierra; las tablas/posición se refrescan por invalidación. Deshabilitado si N = 0.
- Requiere una empresa seleccionada (si el filtro global es "todas", el botón Auto-conciliar del
  Consolidado pide elegir una empresa primero).

### 10. Bancos: estado de conciliación (`BanksTab.tsx`)
- Columna **Conciliación**: badge "Conciliado" (verde) / "Suelto" (gris) según `t.reconciled`.
- Filtro **Conciliación** (`Select`: Todos / Conciliado / Suelto) → pasa `reconciliation` a
  `useBankTransactions`. El deep-link desde el cuadre lo deja en "Suelto".
- Ajustar el `colSpan` del `<tfoot>` por la columna nueva.

### 11. Gastos: columna Proveedor (`ExpensesTab.tsx`)
- Agregar columna **Proveedor** entre "Descripción" y "Empresa", mostrando `r.vendorName ?? '—'`,
  enlazada a `/proveedores/${r.vendorId}` cuando `vendorId` exista (como hace `PayablesTab`).

### 12. Guardrail de monto en el modal manual (`ReconcileModal.tsx`)
- Al listar candidatos, marcar cuándo el monto del movimiento ≠ el monto objetivo de la factura
  (ya se conoce `c.exact`). Para los **no exactos**, mostrar un aviso sutil ("movimiento $X ≠
  factura $Y") junto al botón Conciliar. No bloquea.

## Archivos afectados

**Backend**: `finance.service.ts` (helper compartido, `getReconciliationSummary`, `getConsolidated`,
`autoReconcile`; quitar `getFinancePosition`), `finance.controller.ts`, `finance.routes.ts`,
`finance.schema.ts` (nuevo, o donde vivan los schemas Zod del módulo), `finance-imports.service.ts`
(`reconciled` + filtro en `listBankTransactions`), `finance-imports.schema.ts` (filtro
`reconciliation`).

**Frontend**: `types/domain.ts` (tipos nuevos + `reconciled` en `BankTransaction`; barrer
`FinancePosition`/`FinancePositionOrg` sin uso), `hooks/useFinance.ts` (`useConsolidated`,
`useAutoReconcile`, filtro `reconciliation`; quitar `useFinancePosition`),
`pages/finance/ConsolidatedPosition.tsx` (cuadre + auto-conciliar + prop de mes y de deep-link),
`pages/finance/FinanceSummaryTab.tsx` (quitar duplicados), `pages/finance/FinancePage.tsx` (selector
de mes `consolidatedMonth`, deep-link a Bancos vía `banksInitialFilter`),
`pages/finance/AutoReconcileModal.tsx` (nuevo), `pages/finance/BanksTab.tsx` (columna + filtro de
conciliación + prop `initialReconciliation`), `pages/finance/ExpensesTab.tsx` (columna Proveedor),
`pages/finance/ReconcileModal.tsx` (aviso de monto).

## Manejo de errores y casos borde

- **Auto-conciliar sin empresa seleccionada** → el modal pide elegir una (no corre con "todas").
- **Auto-conciliar sin pares** → preview muestra "0 pares"; Confirmar queda deshabilitado.
- **Idempotencia** → re-ejecutar auto-conciliar no duplica ni pisa enlaces manuales (solo mira no
  pagadas + movimientos sin enlazar).
- **Ventana de fecha** → un par de monto único pero con el movimiento a >60 días NO se auto-enlaza
  (queda para manual); evita calces coincidentes lejanos.
- **Cuadre con `null`** → movimientos sin dirección clara (monto 0) no afectan; se cuentan por
  `creditAmount>0`/`chargeAmount>0`.
- **`reconciled` y rendimiento** → `_count` en el `include` es una agregación barata de Prisma;
  para cientos de movimientos no hay problema.
- **Revertir** un pago (manual o auto) ya limpia `paidByBankTransactionId` (lógica existente de
  `registerPayment` con `paidDate:null`); el movimiento vuelve a "Suelto" al refrescar.
- **Filtro `reconciliation`** combinado con los otros filtros de Bancos (cuenta/mes/categoría/
  búsqueda) debe componerse en el mismo `where`.

## Fuera de alcance (YAGNI / piezas siguientes)

- Pagos parciales / saldos (decisión de dominio: todo o nada).
- Auto-conciliación N:1 por suma de varias facturas (sigue manual).
- Reportes ejecutivos (flujo, gasto por categoría en el tiempo) → **pieza ③**.
- Validación dura de monto al conciliar (solo se avisa, no se bloquea).
- Cambios de schema / multiusuario.

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build`.
- Frontend: `cd frontend && npm run lint` y `npm run build`.
- Manual (login `ceo@vitam.tech`, Finanzas):
  1. **Resumen/Consolidado** muestra posición + el bloque **Cuadre del mes** (abonos/cargos
     total·conciliado·suelto) y "⚠ N sin enlazar".
  2. **[Auto-conciliar exactos]** → el preview muestra N pares; al confirmar, esas facturas/gastos
     quedan pagados y enlazados; el cuadre baja los "sueltos".
  3. Re-ejecutar auto-conciliar → 0 pares nuevos (idempotente); los enlaces manuales no se tocan.
  4. **[revisar]** lleva a **Bancos** filtrado a "Suelto"; el badge Conciliado/Suelto es correcto.
  5. Un movimiento de monto repetido (dos facturas iguales) **no** se auto-concilia; se resuelve en
     el modal manual, que **avisa** si el monto no calza.
  6. **Gastos** muestra la columna **Proveedor** (razón social) enlazada a la ficha del proveedor.
  7. Los números de por-cobrar/por-pagar coinciden con los del Resumen anterior (el helper no
     cambió la lógica, solo la deduplicó).
