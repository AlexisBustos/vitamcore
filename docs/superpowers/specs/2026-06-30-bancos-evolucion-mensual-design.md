# Bancos — Evolución mensual de caja

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feat/bancos-evolucion-mensual`
**Roadmap:** Sub-proyecto **A** de la consolidación de Finanzas (orden acordado: A evolución
mensual → B categorización → C conciliación → D posición consolidada). Ver memoria
`finanzas-consolidacion-roadmap`.

## Objetivo

Hoy la pestaña **Bancos** muestra solo la **foto de caja** (tarjeta "Caja total" + una por
cuenta, con el saldo del último movimiento) y una tabla de movimientos. Eso responde
*"¿cuánto tengo hoy?"* pero no *"¿cómo llegué hasta acá?"*. Agregar una **vista de evolución
mensual**: por cada mes, el **saldo al cierre** y el **flujo neto** (con abonos y cargos),
para ver la tendencia de la caja en el tiempo. De paso, aclarar el "Caja total" indicando
**a qué fecha** corresponde la foto.

Con las cartolas ya cargadas (2 cuentas de Vitam Healthcare, Banco Chile, enero–mayo 2026),
la vista funciona de inmediato sin importar nada nuevo.

## Contexto: lo que ya existe

- `bank_transactions` trae **saldo corrido** (`balance`) por movimiento; el saldo de una
  cuenta NO se recalcula, se lee del último movimiento. Ya se usa así en
  `listBankAccounts` (`DISTINCT ON (bankAccountId) ... ORDER BY transactionDate DESC, createdAt DESC`).
- `listBankTransactionMonths` ya agrupa por mes con `date_trunc('month', ...)` y devuelve
  `YYYY-MM`.
- `BanksTab.tsx` calcula `totalCash` sumando `currentBalance` de todas las cuentas y pinta
  las tarjetas + la tabla de movimientos (con filtros cuenta/mes/búsqueda).
- Patrón del módulo `finance-imports`: `routes → controller (Zod .parse) → service (Prisma)
  → schema`. Respuestas `{ data: ... }`. Hooks React Query en `useFinance.ts` con key
  `['finance-imports', ...]`.

## Decisiones de diseño

- **Protagonista: ambos** — saldo de cierre (tendencia) + flujo neto del mes, en una misma
  tabla, con columnas Abonos y Cargos.
- **Formato: tabla + barras CSS** — sin agregar ninguna librería de gráficos (la app no
  tiene ninguna hoy). La barra representa el saldo de cierre, normalizada al saldo máximo
  del rango.
- **Respeta los filtros de cuenta y empresa** igual que el resto de la pestaña:
  - Sin cuenta seleccionada → **caja consolidada por mes** (suma de cuentas).
  - Con una cuenta → la serie de esa cuenta.
  - **Ignora** los filtros `mes` y `búsqueda` (la evolución es la vista global de todos los
    meses; esos filtros son para la tabla de movimientos de abajo).
- **Orden: mes más reciente arriba** (consistente con la tabla de movimientos, que es desc).
- **Carry-forward**: el saldo de cierre de un mes sin movimientos arrastra el cierre del mes
  anterior (ver más abajo). Clave para que la consolidación no muestre $0 falsos.
- **Solo lectura, sin multi-moneda** (todo CLP), sin proyecciones. YAGNI.

## Lógica de cálculo (la parte fina)

Dos agregaciones independientes sobre `bank_transactions` (filtradas por org y, si aplica,
cuenta), **por cuenta y por mes**:

1. **Flujos del mes** (directo en SQL):
   ```sql
   SELECT "bankAccountId",
          to_char(date_trunc('month', "transactionDate"), 'YYYY-MM') AS mes,
          SUM("creditAmount")::bigint AS abonos,
          SUM("chargeAmount")::bigint AS cargos
   FROM "bank_transactions"
   WHERE <org/cuenta>
   GROUP BY 1, 2;
   ```
   `flujoNeto = abonos − cargos`.

2. **Saldo de cierre del mes por cuenta** = `balance` del último movimiento dentro de ese
   mes (`DISTINCT ON`):
   ```sql
   SELECT DISTINCT ON ("bankAccountId", date_trunc('month', "transactionDate"))
          "bankAccountId",
          to_char(date_trunc('month', "transactionDate"), 'YYYY-MM') AS mes,
          "balance" AS cierre
   FROM "bank_transactions"
   WHERE <org/cuenta>
   ORDER BY "bankAccountId", date_trunc('month', "transactionDate"),
            "transactionDate" DESC, "createdAt" DESC;
   ```

**Ensamblado en JS** (`service`):

- Construir el rango de meses `[mesMín … mesMáx]` (continuo, sin huecos) tomando el **mínimo y
  máximo de las claves de mes** que devuelven las dos consultas `$queryRaw` (ambas comparten
  el mismo grano `YYYY-MM`); no hace falta una tercera consulta.
- **Por cada cuenta**, recorrer los meses en orden cronológico y construir su serie de cierre:
  - Si la cuenta tiene cierre propio ese mes → ese valor.
  - Si no, **arrastrar** el cierre del mes anterior de esa cuenta (carry-forward).
  - Meses **anteriores al primer movimiento** de la cuenta → la cuenta aporta `0` (no se
    arrastra hacia atrás).
- **Caja consolidada del mes** = suma, sobre todas las cuentas, de su cierre (ya con
  carry-forward) ese mes. *(El carry-forward debe aplicarse por cuenta ANTES de sumar:
  una cuenta sin movimientos en el mes igual mantiene su saldo.)* Con una sola cuenta
  filtrada, es simplemente su serie.
- **Flujos consolidados del mes** = suma de `abonos`/`cargos`/`flujoNeto` de las cuentas ese
  mes (0 si ninguna tuvo movimientos).
- Devolver los meses **en orden descendente** (más reciente primero).

**Forma de salida** (`{ data: BankMonthlyPoint[] }`):
```ts
type BankMonthlyPoint = {
  month: string;        // 'YYYY-MM'
  closingBalance: number;
  netFlow: number;      // abonos − cargos
  credits: number;      // abonos
  charges: number;      // cargos
};
```

## Backend

Todo en el módulo existente `modules/finance-imports`.

### 1. Schema (`finance-imports.schema.ts`)
- El endpoint solo necesita `organizationId?` y `bankAccountId?`. **Reutilizar**
  `listTransactionsQuery.pick({ organizationId: true, bankAccountId: true })` en el controller,
  idéntico a como ya lo hace `listTransactionMonthsController` (no crear un schema nuevo, para
  no bifurcar la convención).

### 2. Service (`finance-imports.service.ts`)
- Nueva función `listBankMonthly(filters: { organizationId?: string; bankAccountId?: string })`
  que ejecuta las dos consultas `$queryRaw` (con `Prisma.sql`/`Prisma.join` para las
  condiciones, igual que `listBankTransactionMonths`), arma el rango de meses y aplica el
  carry-forward descrito. Devuelve `BankMonthlyPoint[]` ordenado desc.
- Helper interno para iterar meses `YYYY-MM` (sumar 1 mes en UTC) — sin dependencias nuevas.
- Casteos: `SUM(...)::bigint` vuelve como `bigint` por `$queryRaw`; convertir con `Number()`
  (igual que `movementCount` en `listBankAccounts`). `balance` es `Int` → number directo.

### 3. Controller (`finance-imports.controller.ts`)
- `listMonthlyController`: parsea el query con el schema y responde
  `{ data: await service.listBankMonthly(filters) }`.

### 4. Routes (`finance-imports.routes.ts`)
- `financeImportsRouter.get('/transactions/monthly', asyncHandler(listMonthlyController));`
  Colocar **antes** de `'/transactions'` (igual que `/transactions/months`, para que la ruta
  específica no la capture la genérica).

## Frontend

### 5. Tipos (`types/domain.ts`)
- `export interface BankMonthlyPoint { month: string; closingBalance: number; netFlow: number;
  credits: number; charges: number; }`.

### 6. Hook (`hooks/useFinance.ts`)
- `useBankMonthly(filters: { organizationId?: string; bankAccountId?: string })` →
  `GET /finance/imports/transactions/monthly`, key
  `['finance-imports', 'monthly', filters]`, mismo patrón que `useBankTransactionMonths`.
- No requiere cambios de invalidación: confirmar una importación ya invalida
  `['finance-imports']` (key raíz), que cubre esta query.

### 7. UI (`pages/finance/BanksTab.tsx`)
- Llamar `useBankMonthly({ organizationId, bankAccountId: bankAccountId || undefined })`.
- Nueva sección **entre las tarjetas de saldo y los filtros de movimientos**: una `Card` con
  una tabla:
  - Columnas: **Mes** · **Saldo al cierre** · **Flujo neto** (verde/rojo según signo, como en
    el `tfoot` actual) · **Abonos** · **Cargos** · barra de tendencia.
  - **Barra CSS**: `width = closingBalance / maxClosing * 100%` (maxClosing = mayor
    `closingBalance` del set; guardar contra división por 0). Un `div` con fondo
    `var(--color-primary)` dentro de un track gris; sin librerías.
  - Encabezado de la sección: título "Evolución mensual" + subtítulo aclarando que el saldo
    es el cierre según las cartolas cargadas.
  - Estados: si `monthly.isLoading` → `Spinner`; si vacío (no debería con datos) → omitir la
    sección. Reusar `formatMoney`/`formatDate` y el formateo de mes (`YYYY-MM` → "Ene 2026";
    agregar un helper local `formatMonth` si no existe uno reutilizable).
- **Aclaración del "Caja total"** (decisión 3): cambiar el `hint` de la `MetricCard` "Caja
  total" para incluir la fecha de la foto, p. ej. ``${n} cuenta(s) · al ${formatDate(maxLastMovementDate)}``
  donde `maxLastMovementDate` = máximo `lastMovementDate` de las cuentas. `lastMovementDate`
  es un string ISO: comparar como fechas parseadas (o strings ISO lexicográficamente), **no**
  con `Math.max` sobre el raw. Si no hay movimientos, mantener solo el conteo.

### 8. Formateo de mes
- Helper `formatMonth(ym: string)` que convierte `'2026-05'` → `'May 2026'` (en español).
  No existe en `lib/domain.ts` (solo `formatDate`/`formatMoney`): agregarlo ahí para que sea
  reutilizable por otros sub-proyectos. Ojo: `toLocaleDateString('es-CL', { month: 'short' })`
  devuelve el mes en **minúscula** (`'may'`); capitalizar explícitamente la inicial si se
  quiere `'May 2026'`.

## Archivos afectados

**Backend**: `finance-imports.schema.ts`, `finance-imports.service.ts`,
`finance-imports.controller.ts`, `finance-imports.routes.ts`.

**Frontend**: `types/domain.ts`, `hooks/useFinance.ts`, `pages/finance/BanksTab.tsx`,
`lib/domain.ts` (helper `formatMonth`, si no existe).

## Manejo de errores y casos borde

- **Sin movimientos** (org/cuenta sin cartolas): el endpoint devuelve `[]`; la sección de
  evolución no se renderiza (la pestaña ya muestra su propio empty state de "Sin cuentas").
- **Mes sin movimientos en medio del rango**: el flujo es 0 y el cierre arrastra el del mes
  anterior (no aparece como caída a $0).
- **Cuenta que empieza después** (primer movimiento en un mes posterior): aporta 0 a la caja
  consolidada en los meses previos a su primer movimiento.
- **`balance` nulo**: hoy no ocurre (0 movimientos sin saldo en los datos), pero si un mes
  cerrara con `balance` null, el `DISTINCT ON` toma el último movimiento igual; tratar null
  como "sin cierre propio" y arrastrar el anterior.
- **Empate de fecha** dentro del mes: desempata por `createdAt DESC` (respeta el orden de
  filas de la cartola), igual que `listBankAccounts`.
- **Multi-moneda**: no se maneja; todas las cuentas actuales son CLP. Sumar saldos asume
  misma moneda (consistente con el `totalCash` actual).

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build`.
- Frontend: `cd frontend && npm run build`.
- Manual:
  1. En Bancos (sin filtrar cuenta), la tabla de evolución muestra ene–may 2026 con el
     saldo de cierre consolidado; mayo coincide con la "Caja total" ($15.199.023).
  2. Filtrar por **Banco Chile 1** muestra su serie propia (cierre de mayo = $5.715.731);
     por **Banco Chile 2**, $9.483.292.
  3. El flujo neto de cada mes cuadra con abonos − cargos.
  4. La tarjeta "Caja total" muestra "2 cuenta(s) · al 29 may 2026" (formato de `formatDate`).
  5. Filtrar por Vitam Tech (sin cuentas) no rompe la pestaña.
