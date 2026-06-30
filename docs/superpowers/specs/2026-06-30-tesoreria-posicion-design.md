# Posición consolidada / Tesorería

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feat/tesoreria-posicion`
**Roadmap:** Sub-proyecto **D** (último) de la consolidación de Finanzas (A evolución ✅ → B
categorización ✅ → C conciliación ✅ → **D posición**). Ver memoria
`finanzas-consolidacion-roadmap`.

## Objetivo

Mostrar la **posición consolidada** de cada empresa: **Caja (bancos) + Por cobrar − Por pagar**,
como bloque destacado arriba de la pestaña **Resumen** de Finanzas. Junta por primera vez la
**caja real** (banco) con el **devengado** (libros AR/AP) en una sola vista, sin doble conteo
(posible gracias a C: lo cobrado salió de "por cobrar" y está en caja).

## Contexto: lo que ya existe

- `finance.service.ts → getSummary(organizationId?)` ya calcula `pendingIncome` (por cobrar =
  ventas con `netAmount>0` no pagadas + ingresos manuales pendientes) y `pendingExpense` (gastos
  `PENDING`/`OVERDUE`), con constantes módulo `INCOME_PENDING`/`EXPENSE_PENDING`. **No** incluye
  caja. Endpoint `GET /finance/summary` (controller con `querySchema = { organizationId? }`).
- **Caja**: el saldo actual de una cuenta = `balance` del último movimiento (`finance-imports`
  lo expone enriqueciendo `listBankAccounts` con `DISTINCT ON ... ORDER BY transactionDate DESC,
  createdAt DESC`). Cuentas en `bank_accounts` (`isActive`, `organizationId`).
- `FinanceSummaryTab.tsx` consume `useFinanceSummary` (key `['finance','summary',...]`). Las
  mutaciones de pago/import invalidan `['finance']` vía `invalidateFinance`, así que cualquier
  query bajo `['finance', ...]` se refresca solo.

## Decisiones de diseño

- **Bloque arriba del Resumen** (no pestaña nueva): lo primero que ve el CEO al entrar a Finanzas.
- **Unidad propia**: función `getFinancePosition` + endpoint `GET /finance/position` separados
  (no tocar `getSummary`), y un componente `ConsolidatedPosition.tsx` propio (no engordar
  `FinanceSummaryTab`).
- **Por empresa + total**, respetando el filtro de empresa de la página.
- **Sin doble conteo** (apoyado en C): por cobrar solo cuenta lo no pagado; lo pagado está en caja.
- **YAGNI**: sin forecast, sin multi-moneda (todo CLP), sin gráficos. No tocar el resto del
  Resumen ni otras pestañas.
- **Matiz documentado**: la caja es la foto "según última cartola cargada"; AR/AP son los libros
  al día (fechas "as of" distintas, como el "Caja total" de Bancos).

## Backend

Todo en el módulo `finance` (mismo patrón routes → controller → service).

### 1. Service — `getFinancePosition(organizationId?)` (`finance.service.ts`)
Agregar `import { Prisma } from '@prisma/client';` (hoy solo importa tipos). Reusar las constantes
`INCOME_PENDING`/`EXPENSE_PENDING` ya presentes.

- **Caja por empresa** (`$queryRaw`, último saldo por cuenta sumado por empresa):
  ```sql
  SELECT ba."organizationId", COALESCE(SUM(last.balance), 0)::bigint AS caja
  FROM "bank_accounts" ba
  LEFT JOIN LATERAL (
    SELECT t.balance FROM "bank_transactions" t
    WHERE t."bankAccountId" = ba.id
    ORDER BY t."transactionDate" DESC, t."createdAt" DESC
    LIMIT 1
  ) last ON true
  WHERE ba."isActive" = true {AND ba."organizationId" = ${organizationId}}
  GROUP BY ba."organizationId"
  ```
  El `AND` opcional con `organizationId ? Prisma.sql\`...\` : Prisma.empty`. `caja` vuelve `bigint`
  → `Number()`.
- **Por cobrar por empresa**: dos `incomeRecord.groupBy(['organizationId'])` combinados (espejo de
  `getSummary`):
  - ventas: `_sum.netAmount`, where `documentKind != CREDIT_NOTE`, `status != CANCELLED`,
    `paidDate: null`, `netAmount: { gt: 0 }`.
  - manuales: `_sum.amount`, where `documentKind != CREDIT_NOTE`, `netAmount: null`,
    `status: { in: INCOME_PENDING }`.
  - `receivable_org = ventas + manuales`.
- **Por pagar por empresa**: `expenseRecord.groupBy(['organizationId'])`, `_sum.amount`, where
  `status: { in: EXPENSE_PENDING }`.
- Todas las queries con `...orgFilter` (`organizationId ? { organizationId } : {}`).
- **Ensamblado**: unir los `organizationId` que aparezcan en caja/receivable/payable; traer
  nombres con `prisma.organization.findMany({ select: { id, name } })`. Por cada empresa:
  `{ id, name, cash, receivable, payable, position: cash + receivable − payable }`. Ordenar por
  nombre.
- **Totales**: sumar `cash`/`receivable`/`payable` de las filas; `position = cash + receivable −
  payable`.
- **Retorno**:
  ```ts
  {
    cash: number; receivable: number; payable: number; position: number;
    byOrganization: { id: string; name: string; cash: number; receivable: number; payable: number; position: number }[];
  }
  ```

### 2. Controller + ruta (`finance.controller.ts`, `finance.routes.ts`)
- `positionController`: reutiliza el `querySchema` local (`{ organizationId? }`), responde
  `{ data: await service.getFinancePosition(organizationId) }`.
- `financeRouter.get('/position', asyncHandler(positionController));`

## Frontend

### 3. Tipos (`types/domain.ts`)
```ts
export interface FinancePositionOrg {
  id: string; name: string;
  cash: number; receivable: number; payable: number; position: number;
}
export interface FinancePosition {
  cash: number; receivable: number; payable: number; position: number;
  byOrganization: FinancePositionOrg[];
}
```

### 4. Hook (`hooks/useFinance.ts`)
- `useFinancePosition(organizationId?)` → `GET /finance/position`, key
  `['finance','position', organizationId ?? 'all']` (espejo de `useFinanceSummary`). No requiere
  invalidación nueva: las mutaciones de pago/conciliación/import ya invalidan `['finance']`.

### 5. Componente (`pages/finance/ConsolidatedPosition.tsx`, nuevo)
- Usa `useFinancePosition(organizationId)`.
- **4 `MetricCard`**: Caja · Por cobrar · Por pagar · **Posición** (esta resaltada, `tone` por
  signo: `position >= 0 ? 'success' : 'danger'`). Un subtítulo con la fórmula
  "Posición = Caja + Por cobrar − Por pagar".
- **Tabla por empresa**: Empresa · Caja · Por cobrar · Por pagar · Posición (reusar estilo de la
  tabla "Resultado por empresa" del Resumen). Solo se muestra si `byOrganization.length > 1`
  (con una empresa, las tarjetas ya lo dicen todo).
- Estados loading/error con `Spinner`/`ErrorState` (`getErrorMessage`).

### 6. Integración (`FinanceSummaryTab.tsx`)
- Renderizar `<ConsolidatedPosition organizationId={organizationId} />` **arriba de todo**
  (antes del grid "Ingresos/Gastos del mes"). El resto del Resumen queda igual.

## Archivos afectados

**Backend**: `finance.service.ts`, `finance.controller.ts`, `finance.routes.ts`.

**Frontend**: `types/domain.ts`, `hooks/useFinance.ts`, nuevo
`pages/finance/ConsolidatedPosition.tsx`, `pages/finance/FinanceSummaryTab.tsx`.

## Manejo de errores y casos borde

- **Empresa sin cuentas bancarias**: caja = 0 (no aparece en la query de caja; se incluye igual si
  tiene AR/AP). Con `LEFT JOIN LATERAL` + `COALESCE`, una cuenta sin movimientos aporta 0.
- **Empresa sin AR/AP**: receivable/payable = 0.
- **Filtro de empresa activo**: todas las queries se acotan; `byOrganization` trae solo esa
  empresa (y entonces la tabla por empresa no se muestra, solo las tarjetas).
- **`balance` nulo en el último movimiento**: el `LIMIT 1` toma ese balance; `COALESCE(SUM,0)`
  evita null en el total (un null individual lo trataría Postgres como 0 en `SUM`). Hoy no ocurre
  (0 movimientos sin saldo).
- **bigint de `SUM(...)::bigint`** → `Number()` (igual que en `listBankMonthly`).
- **Posición negativa**: válida (más por pagar + poca caja que por cobrar); la tarjeta va en rojo.
- **Doble conteo**: evitado por diseño — por cobrar filtra `paidDate: null`; la caja ya refleja lo
  cobrado.

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build`.
- Frontend: `cd frontend && npm run build`.
- Manual:
  1. En Finanzas → Resumen, arriba aparece "Posición consolidada" con Caja, Por cobrar, Por pagar
     y Posición. Sin filtro de empresa, la Caja total coincide con la de Bancos ($15.199.023 con
     los datos actuales, todo en Healthcare).
  2. Posición = Caja + Por cobrar − Por pagar (cuadra con las tarjetas).
  3. La tabla por empresa muestra Healthcare (con caja) y Tech (caja 0) si ambas tienen datos.
  4. Filtrar por una empresa acota las tarjetas; la tabla por empresa se oculta.
  5. Conciliar/pagar una factura (sub-proyecto C) mueve "por cobrar"/"por pagar" y refresca la
     posición sin recargar.
