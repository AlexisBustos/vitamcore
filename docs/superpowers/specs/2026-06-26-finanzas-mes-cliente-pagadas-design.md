# Finanzas: filtro por mes, columna cliente y arreglo de "pagadas"

**Fecha:** 2026-06-26
**Estado:** Aprobado (diseño)
**Rama:** `feat/finanzas-mes-cliente-pagadas`

## Objetivo

Tres mejoras al módulo de Finanzas, enfocadas en revisar el libro de ventas mes a mes
y en mantener la integridad del estado de cobro:

1. **Arreglar "facturas pagadas"**: hay facturas que aparecen como *Pagado* sin que se
   haya registrado su cobro. Reparar el dato y blindar para que no recurra.
2. **Filtro por mes** en las pestañas *Ingresos* y *Cuentas por cobrar*.
3. **Columna Cliente** (razón social) en la tabla de *Ingresos*, enlazada al detalle
   del cliente.

## Diagnóstico del bug (parte 1)

La importación del libro de ventas **nunca** marca pagada una factura: el parser
(`finance-imports.parser.ts → parseSalesRows`) fija `status: 'INVOICED'` y la escritura
(`finance-imports.service.ts:445`) fija `paidDate: null`.

La causa real es **dato legacy**: 3 facturas de *WEIR MINERALS CHILE SA* (folios 1970,
1971, 1973), importadas el **2026-06-25** con una versión previa del parser que ponía
`status='PAID'`, quedaron con `status='PAID'` pero `paidDate=NULL`. La tabla de Ingresos
muestra el badge del `status` guardado (`IncomeStatusBadge`), por eso se ven como
*Pagado*. Los registros de febrero (importados después) están correctos.

Invariante que se viola: **`status='PAID'` debe implicar `paidDate` no nulo.** Los
únicos escritores hoy son: la importación (correcta), `registerPayment` (mantiene ambos
en sync) y el formulario de ingreso (puede fijar `status='PAID'` sin `paidDate`, porque
el formulario no tiene campo de fecha de pago).

## Decisiones de diseño

- El filtro de mes opera sobre **`incomeDate`** (la fecha visible en la tabla; para
  ventas equivale a la fecha de emisión del libro). En UTC, para no desfasar.
- El estado de cobro NO se reescribe en el frontend: tras reparar el dato y blindar la
  escritura, el `status` guardado vuelve a ser confiable y el badge actual basta.
- El desplegable de meses solo ofrece **meses con datos** (no meses vacíos).

## Parte 1 — Reparar + blindar el estado "pagado"

### 1a. Migración de reparación (idempotente)

Nueva migración Prisma (`prisma/migrations/<timestamp>_fix_paid_without_paiddate/migration.sql`):

```sql
-- Corrige facturas marcadas como pagadas sin fecha de cobro (dato legacy de
-- importaciones previas al rediseño de cobranza). El cobro se registra a mano.
UPDATE "income_records"
SET "status" = 'INVOICED'
WHERE "status" = 'PAID' AND "paidDate" IS NULL;
```

No cambia el schema (no hay `prisma migrate` de modelo); es una migración solo-datos.
Se crea el directorio con el `migration.sql` y se aplica con `prisma migrate deploy`
(o `prisma migrate dev` en desarrollo). Idempotente: re-ejecutarla no afecta filas ya
corregidas.

### 1b. Guard en el service (`income.service.ts`)

Forzar la invariante en `create` y `update`: si el `status` entrante es `'PAID'` pero no
hay `paidDate`, se degrada a `'INVOICED'`.

- `create`: el `createIncomeSchema` no incluye `paidDate`, por lo que todo ingreso nace
  con `paidDate=null`. Entonces: si `input.status === 'PAID'` → guardar como `'INVOICED'`.
- `update`: leer el `paidDate` actual del registro (ya se hace un `findUnique`; agregar
  `paidDate` al `select`). Si `input.status === 'PAID'` y el registro no tiene `paidDate`
  → guardar `status: 'INVOICED'`.

`registerPayment` y la importación no se tocan (ya respetan la invariante).

## Parte 2 — Filtro por mes (Ingresos + Cuentas por cobrar)

### 2a. Backend: parámetro `month` en el listado

`income.schema.ts` — agregar a `listIncomeQuery`:
```ts
month: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)').optional(),
```

`income.service.ts → list` — si `filters.month` viene, traducirlo a un rango sobre
`incomeDate`:
```ts
if (filters.month) {
  const [y, m] = filters.month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // primer día del mes siguiente
  where.incomeDate = { gte: start, lt: end };
}
```
Esto sirve para ambas pestañas porque las dos consumen `GET /income` (Cuentas por cobrar
usa `paymentState`, Ingresos usa el listado general); el `month` se combina con los demás
filtros vía el mismo `where`.

### 2b. Backend: endpoint de meses con datos

Nuevo `GET /income/months?organizationId=` → `{ data: string[] }` con los meses
`YYYY-MM` que tienen ingresos, ordenados descendente.

- `income.service.ts → listMonths(organizationId?)`: consulta los meses distintos de
  `incomeDate`. Usar `prisma.$queryRaw` con `to_char(date_trunc('month', "incomeDate"),
  'YYYY-MM')`, filtrando por organización cuando venga e ignorando `incomeDate` nulo.
  Devuelve `string[]` ordenado desc.
- `income.controller.ts → listMonthsController`: valida `organizationId` opcional
  (`z.object({ organizationId: z.string().optional() }).parse(req.query)`) y responde
  `{ data }`.
- `income.routes.ts`: registrar `incomeRouter.get('/months', asyncHandler(listMonthsController))`
  **antes** de `incomeRouter.get('/:id', ...)` para que Express no capture `months`
  como `:id`.

### 2c. Frontend

- `hooks/useFinance.ts`:
  - Agregar `month?: string` a `FinanceFilters` (se serializa solo con `toQuery`,
    que ya omite vacíos; `useIncome` no cambia).
  - Nuevo hook `useIncomeMonths(organizationId?)` → `useQuery(['income','months',org], …)`
    que llama `GET /income/months`.
- `components/MonthFilter.tsx` (nuevo): un `Select` con opción "Todos los meses" (valor
  vacío) y una opción por cada mes con datos. Etiqueta legible en español
  (`Enero 2026`), valor `YYYY-MM`. Props: `{ organizationId?, value?, onChange }`.
  Internamente usa `useIncomeMonths`.
- `pages/finance/IncomeTab.tsx`: agregar `<MonthFilter>` a la barra de filtros y un
  estado `month` que se pasa en `filters`.
- `pages/finance/ReceivablesTab.tsx`: agregar `<MonthFilter>` junto al selector de estado
  y pasar `month` en el `useIncome({ organizationId, paymentState, month })`.

## Parte 3 — Columna Cliente en la tabla de Ingresos

`pages/finance/IncomeTab.tsx`: agregar una columna **"Cliente"** entre Descripción y
Empresa.
- Muestra `r.clientName ?? '—'`.
- Si `r.clientId` existe, el nombre es un `<Link to={\`/clientes/${r.clientId}\`}>`
  (estilo enlace, consistente con la app). Si no, texto plano.
- El tipo `IncomeRecord` ya incluye `clientId` y `clientName`; no se toca el tipo.

## Archivos afectados

**Backend**
- `prisma/migrations/<timestamp>_fix_paid_without_paiddate/migration.sql` (nuevo, solo datos).
- `income.schema.ts` — param `month` en `listIncomeQuery`.
- `income.service.ts` — rango por mes en `list`; nuevo `listMonths`; guard PAID en
  `create`/`update`.
- `income.controller.ts` — nuevo `listMonthsController`.
- `income.routes.ts` — ruta `GET /months` (antes de `/:id`).

**Frontend**
- `hooks/useFinance.ts` — `month` en `FinanceFilters`; hook `useIncomeMonths`.
- `components/MonthFilter.tsx` — nuevo.
- `pages/finance/IncomeTab.tsx` — filtro de mes + columna Cliente.
- `pages/finance/ReceivablesTab.tsx` — filtro de mes.

## Flujo de datos (filtro por mes)

```
MonthFilter (useIncomeMonths → GET /income/months) → value YYYY-MM
   └─ IncomeTab/ReceivablesTab actualiza filters.month
        └─ useIncome → GET /income?...&month=YYYY-MM
             └─ service.list aplica where.incomeDate ∈ [inicio, finMes)
```

## Manejo de errores y casos borde

- `month` con formato inválido → Zod 400 (no debería ocurrir desde el `Select`).
- Sin mes seleccionado → sin filtro de fecha (todos los registros).
- Registros con `incomeDate=null` → no aparecen al filtrar por un mes (esperado);
  tampoco generan opciones en el desplegable.
- `GET /income/months` sin `organizationId` → meses de todas las empresas.
- Reparación idempotente: re-ejecución no tiene efecto sobre filas ya corregidas.
- Guard en `update`: si el registro sí tiene `paidDate` y el form manda `status='PAID'`,
  se mantiene `PAID` (coherente). Solo se degrada cuando no hay `paidDate`.

## Verificación

No hay framework de tests; la verificación es el typecheck más prueba manual.
- Backend: `cd backend && npm run build` (tsc) sin errores; `npm run prisma:migrate`
  aplica la reparación.
- Frontend: `cd frontend && npm run build` (tsc --noEmit && vite build) sin errores.
- Manual:
  1. Tras migrar, las 3 facturas WEIR MINERALS ya no aparecen como *Pagado* en Ingresos.
  2. En Ingresos y Cuentas por cobrar, el desplegable de meses ofrece *Enero 2026* y
     *Febrero 2026*; al elegir uno, la tabla se filtra a ese mes; "Todos los meses"
     quita el filtro.
  3. La tabla de Ingresos muestra la columna Cliente; al hacer click en un cliente con
     `clientId`, navega a `/clientes/:id`.
  4. Intentar guardar un ingreso con estado *Pagado* desde el formulario lo deja como
     *Facturado* (no hay fecha de cobro): el paso a pagado queda solo por "Marcar pagada".
