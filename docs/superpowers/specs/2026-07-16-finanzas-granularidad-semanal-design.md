# Granularidad semanal en Finanzas: carga y análisis por semana

**Fecha:** 2026-07-16
**Estado:** aprobado (diseño validado con el CEO)
**Rama:** `develop` (trabajo local)

## Problema

Hoy las finanzas se cargan y se leen **por mes**. El CEO necesita:

1. **Cargar** los archivos de finanzas (ventas, compras, cartolas) **cada semana**, no
   una vez al mes, para que los datos estén frescos.
2. **Analizar** por semana: dashboard, libros de cobrar/pagar, bancos y una tendencia
   semana a semana, para detectar desvíos sin esperar al cierre de mes.

Con cadencia mensual el olvido no existe (doce hitos al año, memorables). Con cadencia
semanal son ~52 por fuente y **un hueco de carga es invisible**: una semana sin importar
no se ve como un error, se ve como una semana mala. El sistema hoy no puede responder
*"¿qué me falta por cargar?"*.

## Punto de partida (estado actual)

### El "mes" del lote es una etiqueta, no un filtro

`FinancialImportBatch.periodMonth` (`schema.prisma:749-784`) se declara en el frontend
con `<Input type="month">` (`FinanceImportsTab.tsx:134`), se normaliza a día 1 UTC
(`import-pipeline.service.ts:436`), se indexa (`schema.prisma:780`)… y **ninguna consulta
de negocio lo usa jamás**. `listBatches` (`import-pipeline.service.ts:179-190`) no filtra
por período: ordena por `createdAt desc` y corta en 30. Su único consumidor es la columna
"Período" de la tabla de historial (`FinanceImportsTab.tsx:309`).

**Consecuencia:** el campo puede mentir sin que nada lo note. Un archivo con filas de
marzo declarado como julio se acepta en silencio: el lote figura como julio y las filas
aterrizan en marzo para todo el reporting.

El mes **real** de todo el análisis se deriva de las fechas de cada fila (`incomeDate`,
`expenseDate`, `transactionDate`) vía `date_trunc('month', …)` o rangos UTC.

### Las fechas son fechas de calendario a medianoche UTC

`normalizeDate` (`finance-imports.parser.ts:113-126`) produce `new Date(Date.UTC(y, m-1, d))`.
No son instantes: son **fechas de calendario ancladas a medianoche UTC**. Una factura no
tiene hora. Esto determina cómo debe implementarse la zona horaria (ver Decisión 4).

### La lógica de mes está fragmentada

- **Parseo mes → rango UTC duplicado 5 veces inline**: `bank-transactions.service.ts:15`
  y `:291`, `finance-reconciliation.service.ts:20`, `:157`, `:357` — pese a existir
  `ledger.ts:28 monthRange()` que hace exactamente eso.
- **Regex del mes copiada 4 veces**: `finance.schema.ts:3`, `finance-imports.schema.ts:57`,
  `income.schema.ts:54`, `expenses.schema.ts:52`.
- **Nombres de meses en español duplicados**: `MonthFilter.tsx:3-13` y
  `ConsolidatedPosition.tsx:15-19`.
- **`currentMonthRange` (`shared/dates.ts:2-6`) usa hora local** (`new Date(y, m, 1)`)
  mientras todo lo demás usa UTC. Con el VPS en UTC y el CEO en Chile (UTC-4), el "mes
  actual" del dashboard es incorrecto durante las últimas horas de cada día 30/31.

### El resumen mezcla granularidades

`finance-summary.service.ts:18` hardcodea `currentMonthRange()` y **no acepta período
del cliente**. Peor: `groupBy(['category'])` y `groupBy(['organizationId'])` (`:60-79`)
**no filtran por mes** — devuelven el histórico completo en la misma respuesta que los
totales del mes, sin distinguirlo.

### Dos defectos de deduplicación (verificados en código)

**a) La clave no incluye la empresa, y el preview tampoco filtra por ella.** `dedupeKey`
de ventas/compras es `[TIPO, documentType, folio, rut, isoDate, amount].join('|')`
(`finance-imports.parser.ts:153-160`, `:223-230`) y `sourceDedupeKey` es `@unique`
**global** (`schema.prisma:649`, `:701`). Los folios son correlativos **por emisor**:
Vitam Healthcare y Vitam Tech tienen ambas su factura #100.

El mecanismo exacto de la pérdida está en el **preview**, no en el insert:
`getExistingDedupeKeys` (`import-pipeline.service.ts:264-292`) consulta
`where: { sourceDedupeKey: { in: dedupeKeys } }` **sin filtrar por `organizationId`**. Si
las dos empresas facturan al mismo cliente, el mismo día, por el mismo monto, la factura
de la segunda empresa se marca `DUPLICATE` en el preview, `confirmImport` la filtra antes
de insertarla (`:136-138`) y **nunca llega a `createRow`**: el ingreso desaparece de los
números sin aviso. Probabilidad baja; modo de fallo: pérdida silenciosa de datos
financieros.

> El `catch` de P2002 (`:425-432`) **no** interviene aquí — por lo que explica el defecto
> (b), ese `catch` no puede saltarse nada en silencio. Atribuirle esta pérdida sería
> diagnosticar la línea equivocada.

`BankTransaction` **no** tiene este problema: su unique es `@@unique([bankAccountId, dedupeKey])`
(`schema.prisma:812`) y `bankAccountId` ya está acotado a una empresa. El backfill toca
solo `income_records` y `expense_records`.

**b) El `catch` de P2002 dentro de la transacción es inútil.** `createRow`
(`import-pipeline.service.ts:425-432`) captura `P2002` y devuelve `false` para "saltar"
el duplicado, pero corre dentro de `prisma.$transaction` (`:142`). En Postgres una
sentencia fallida **aborta la transacción completa** (25P02) y Prisma no pone savepoint
por query: la fila siguiente falla y **todo el lote hace rollback** con un error críptico.

Disparador: un archivo con **dos filas idénticas dentro de sí mismo**. El preview
(`getExistingDedupeKeys`, `:264-292`) dedupea contra la BD pero **no contra el propio
lote**, así que ambas quedan `VALID` y chocan en el confirm. Ya existe un test que lo
caracteriza (salida esperada `prisma:error 25P02`).

> **Reimportar un rango solapado ES seguro hoy**: el preview marca esas filas como
> `DUPLICATE` y `confirmImport` las filtra antes del insert (`:136-138`). El solapamiento
> no es un disparador de este defecto.

### Otros hechos relevantes

- **Sin librerías de fechas** en backend ni frontend (`package.json` de ambos). Todo a
  mano: `addMonths`, `monthRange`.
- **Sin tests de frontend.** El typecheck (`npm run lint`) es el único lint.
- **Backend con Vitest contra BD real** `vitamcore_test` (`npm run test:db:setup` + `npm test`).
- **`listBankMonthly` (`bank-transactions.service.ts:189-251`) no tiene ningún test** y
  contiene la lógica más intrincada del módulo: arrastre de saldos hacia adelante
  rellenando meses sin movimiento con la serie contigua de `monthRange(min,max)` (`:318-331`).
- **El VPS despliega con `prisma migrate deploy`** (sin confirmación interactiva).
- **La capa de agente** (`agent/providers/heuristic.ts:136-137`, `:215-216`) narra
  `monthIncome`/`monthExpense` del resumen.

## Decisiones (acordadas con el CEO)

1. **Semana como lente, mes como verdad.** El mes sigue siendo la unidad contable y de
   cuadre (SII, declaración, cierre): los libros de ventas/compras son artefactos
   mensuales por naturaleza. La semana se **añade** como granularidad de seguimiento.
   El mes no se elimina de ninguna vista.

2. **Alcance del análisis semanal:** dashboard ejecutivo, libros de ingresos/egresos,
   bancos y flujo de caja, y una vista nueva de tendencia semana a semana.

3. **El período del lote se declara explícitamente** (rango desde/hasta), no se deriva.
   Razón: si una semana no tuvo ventas, un rango derivado de las filas **no puede
   distinguir "no hubo ventas" de "no importé nada"**. Un rango declarado sí, y eso es
   lo que habilita la cobertura (Diseño §5).
   Complemento acordado: el min/max real de las filas se calcula igual (ya se parsean) y
   se guarda **junto** al declarado, para advertir en el preview si no cuadran.

4. **Semana ISO 8601 (lunes→domingo), con "hoy" resuelto en `America/Santiago`.**
   Implementación: los cortes se calculan en **aritmética UTC** sobre fechas de calendario
   —convertir a hora de Chile restaría un día a todas las fechas y metería cada lunes en
   la semana anterior—. Santiago se usa en **un solo punto**: decidir qué día es hoy, y
   por tanto en qué período estamos parados.

5. **Enfoque de implementación: dimensión de período unificada** (frente a endpoints
   semanales paralelos o a materializar columnas de semana). Razón: la lógica de mes ya
   está duplicada 5 veces; añadir la semana sin unificar la llevaría a 10 y cada bug de
   borde habría que arreglarlo diez veces. Se descarta materializar (`isoWeek` en las
   filas) por optimización prematura: a este volumen `date_trunc` sobre un índice de fecha
   no es el cuello de botella.

6. **Los dos defectos de deduplicación se arreglan en este trabajo**, en una fase aislada
   que empieza con una **query de diagnóstico** sobre la BD real. Razón: la Fase 1 ya abre
   el código de deduplicación para meter `organizationId`; arreglar media deduplicación y
   dejar la otra mitad rota sería la peor de las opciones. El diagnóstico define si el
   backfill es rutina o rescate.

7. **Sin capa de compatibilidad** para el parámetro `month`. Backend y frontend se
   despliegan juntos, es una app de un solo usuario, y mantener el parámetro viejo dejaría
   dos caminos vivos y un suite de tests que miente.

## Diseño

### 1. Núcleo: `backend/src/modules/shared/period.ts`

Única fuente de verdad de "qué rango de fechas es este período". **Absorbe**
`ledger.ts:monthRange`, `ledger.ts:listMonths`, `listBankTransactionMonths`, las 5 copias
inline del parseo mes→rango y —en la Fase 3— `dates.ts:currentMonthRange`. Ocho sitios que
hoy calculan lo mismo por su cuenta pasan a ser uno.

```ts
export type Granularity = 'week' | 'month';

/** Rango [gte, lt) en UTC del período. */
export function periodRange(g: Granularity, key: string): { gte: Date; lt: Date }
//  ('month', '2026-07')  → [2026-07-01, 2026-08-01)
//  ('week',  '2026-W28') → [2026-07-06, 2026-07-13)   lunes → lunes

/** Clave del período que contiene esa fecha de calendario (UTC). */
export function periodKey(g: Granularity, date: Date): string

/** Clave del período en curso. Resuelve "hoy" en America/Santiago. */
export function currentPeriod(g: Granularity, now?: Date): string

/** Serie contigua de claves entre dos períodos, inclusive. Para carry-forward y tendencia. */
export function periodSeries(g: Granularity, fromKey: string, toKey: string): string[]

/** Claves con datos, desc. Absorbe ledger.ts:listMonths Y listBankTransactionMonths. */
export function listPeriods(
  g: Granularity,
  q:
    | { source: 'income' | 'expense'; organizationId?: string }
    | { source: 'bank'; organizationId?: string; bankAccountId?: string },
): Promise<string[]>

/** Etiqueta legible: '2026-W28' → 'Semana del 6 al 12 jul'; '2026-07' → 'Julio 2026'. */
export function periodLabel(g: Granularity, key: string): string
```

**Formato de claves:** `2026-07` (mes) y `2026-W28` (semana ISO). Ambas ordenan
alfabéticamente igual que cronológicamente, así que los `ORDER BY` y el frontend no
necesitan lógica especial.

**Semana ISO 8601:** la semana 1 es la que contiene el 4 de enero; empieza el lunes. El
borde de año es el caso traicionero: `2026-W01` empieza el **29 de diciembre de 2025**, y
y el 31 de diciembre de 2026 **no** cae en `2027-W01` sino en `2026-W53`, porque 2026 empieza
en jueves y por tanto tiene 53 semanas ISO (el 1 de enero de 2027 también es `2026-W53`).
Va cubierto con tests explícitos en ambos
sentidos.

**"Hoy" en Santiago:** `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now)`
devuelve `'YYYY-MM-DD'` directamente. Sin dependencias, con horario de verano resuelto por
el runtime. **Esto corrige de paso el bug de `currentMonthRange`** (`dates.ts:2`), que se
elimina en favor de `currentPeriod('month')`.

Ese reemplazo va en la **Fase 3**, no en la 0: sustituir hora local por hora de Santiago
**cambia el comportamiento** —es un arreglo, y la Fase 0 se define justamente por no
cambiar ninguno—. En la Fase 3 `finance-summary` ya acepta período y el arreglo tiene dónde
probarse. `currentPeriod` nace en la Fase 0 con sus tests, simplemente sin consumidores
todavía.

**En SQL** el agrupador se parametriza por granularidad vía **whitelist tipada** —igual que
`ledger.ts:35` hace hoy con las tablas—; la granularidad **nunca** se interpola cruda:

```ts
const TRUNC = {
  week:  { unit: 'week',  format: 'IYYY-"W"IW' },
  month: { unit: 'month', format: 'YYYY-MM' },
} as const;

const PERIOD_SOURCES = {
  income:  { table: 'income_records',    column: 'incomeDate' },
  expense: { table: 'expense_records',   column: 'expenseDate' },
  bank:    { table: 'bank_transactions', column: 'transactionDate' },
} as const;
// → date_trunc('week', "incomeDate")  y  to_char(…, 'IYYY-"W"IW')
```

**`listPeriods` absorbe tres copias, no dos.** Además de `ledger.ts:listMonths`
(income/expense) existe `listBankTransactionMonths` (`bank-transactions.service.ts:151-168`),
una tercera implementación del mismo `date_trunc('month')` + `to_char` sobre
`bank_transactions`, con filtros `organizationId?` y `bankAccountId?`. Es el respaldo de
`GET /finance/imports/transactions/months`, el tercer endpoint estilo `/months` (§4).
Dejarla fuera y darle su propio interruptor de granularidad sería justo lo que la Decisión 5
existe para evitar.

La absorción es limpia porque **`BankTransaction` tiene `organizationId` propio**
(`schema.prisma:789`): no hace falta un join a `BankAccount`, y la tercera entrada de la
whitelist tiene la misma forma que las otras dos.

**Por qué la unión discriminada** en vez de un `bankAccountId?` suelto: `income_records` y
`expense_records` **no tienen** columna `bankAccountId`. Con la unión, pasar `bankAccountId`
junto a `source: 'income'` es un **error de tipos**, no un filtro que se ignora en silencio.
El typecheck hace de guardia y no hace falta comprobación en tiempo de ejecución.

**El `IS NOT NULL` va siempre, en las tres fuentes.** Hoy `ledger.ts:51` lo emite porque
`incomeDate` (`schema.prisma:641`) y `expenseDate` (`:693`) son `DateTime?`, mientras
`listBankTransactionMonths:162` lo omite porque `transactionDate` (`:792`) es `NOT NULL`.
Emitirlo siempre es idéntico en comportamiento para las tres —sobre una columna `NOT NULL`
es una condición inerte— y evita un caso especial. La omisión de hoy no significaba nada.

`date_trunc('week', …)` de Postgres trunca al lunes por defecto —coincide con ISO sin
configuración— y `to_char(…, 'IYYY-"W"IW')` produce año-semana **ISO** (`IYYY`/`IW`, no
`YYYY`/`WW`), que es lo que hace correcto el borde de año.

**Frontera:** `period.ts` no conoce Prisma salvo en `listPeriods`; el resto es aritmética
pura de fechas, testeable sin BD.

**Tests** (`backend/test/period.test.ts`):
- Bordes de año en ambos sentidos (`2026-W01` empieza 2025-12-29; 2026-12-31 y 2027-01-01
  son ambos `2026-W53`; `2025-W53` no existe y debe lanzar `badRequest`).
- Semanas que cruzan meses.
- `currentPeriod` con reloj congelado a las 23:00 de Santiago (UTC ya es el día siguiente)
  y a las 00:30 de Santiago.
- **Caracterización del mes**: `periodRange('month', k)` contra una batería de meses con
  los valores **literales** que devuelve el `monthRange` de hoy (capturados antes del
  refactor), incluyendo el borde diciembre→enero. Literales, no una comparación contra
  `monthRange` en vivo: como la Fase 0 deja `monthRange` convertido en un alias de
  `periodRange('month', …)` dentro de `ledger.ts` (ver Fases), compararlos sería comparar
  una función consigo misma. Los literales sí prueban que la absorción no cambió ningún
  resultado.
- `periodSeries` contigua a través de bordes de año.

### 2. Deduplicación correcta

**a) `organizationId` en la clave.** Los parsers de ventas y compras reciben
`organizationId` y lo anteponen:

```
antes:  SALES_REPORT|FACTURA|100|76.543.210-9|2026-07-06|119000
después: <orgId>|SALES_REPORT|FACTURA|100|76.543.210-9|2026-07-06|119000
```

`parseSalesRows(rows, organizationId)` y `parsePurchaseRows(rows, organizationId)`.
`parseBankRows` **no cambia**: ya está acotado por `bankAccountId`.

**Un solo cambio arregla los dos síntomas.** `getExistingDedupeKeys` **no** necesita que se
le añada un filtro `organizationId`: con la empresa dentro de la clave, su
`where: { sourceDedupeKey: { in: dedupeKeys } }` queda acotado por empresa gratis —las
claves de otra empresa ya no pueden coincidir—. Añadir además el filtro sería redundante y
haría creer a un lector futuro que hacían falta dos arreglos.

**Backfill** (migración SQL, solo dos tablas):

```sql
UPDATE income_records
   SET "sourceDedupeKey" = "organizationId" || '|' || "sourceDedupeKey"
 WHERE "sourceDedupeKey" IS NOT NULL
   AND "sourceDedupeKey" NOT LIKE "organizationId" || '|%';   -- idempotente
```
Ídem `expense_records`. La cláusula `NOT LIKE` la hace re-ejecutable sin corromper datos.

**Por qué el guardia funciona** (para que nadie lo "simplifique" después): las claves
antiguas empiezan siempre por `SALES_REPORT|` o `PURCHASE_REPORT|`, nunca por un cuid, así
que `NOT LIKE '<orgId>|%'` distingue sin ambigüedad lo ya migrado de lo pendiente. Y los
cuid no contienen `%` ni `_`, los comodines de `LIKE`, así que la comparación es literal y
no hay que escapar nada.

**El backfill no puede violar el unique, por construcción.** Anteponer `<orgId>|` solo
puede hacer las claves *más* distintas: los cuid no contienen `|`, así que
`orgA|K1 = orgB|K2` exige `orgA = orgB` y `K1 = K2`, que es justo lo que el unique global
ya impedía. No hace falta una query que lo compruebe.

**Diagnóstico previo: ¿ya se perdió algún ingreso?** El daño posible ya ocurrido es la
**ausencia** de filas, y deja un rastro exacto: una fila marcada `DUPLICATE` en el lote de
una empresa cuya clave pertenece a los registros de **otra**. `previewData` conserva las
filas del preview con su `status`, así que es detectable (se corre **antes** de escribir la
migración; si arroja > 0 filas, **se para y se informa al CEO antes de seguir**):

```sql
-- Ventas. Ídem para expense_records con type='PURCHASE_REPORT'.
SELECT b.id, b."originalFileName", b."periodMonth",
       b."organizationId" AS org_del_lote,
       i."organizationId" AS org_que_ya_tenia_la_clave,
       r->>'dedupeKey'    AS clave_descartada
  FROM financial_import_batches b
  CROSS JOIN LATERAL jsonb_array_elements(b."previewData") AS r
  JOIN income_records i ON i."sourceDedupeKey" = r->>'dedupeKey'
 WHERE b.status = 'CONFIRMED'
   AND b.type   = 'SALES_REPORT'
   AND b."previewData" IS NOT NULL
   AND jsonb_typeof(b."previewData") = 'array'
   AND r->>'status' = 'DUPLICATE'
   AND i."organizationId" <> b."organizationId";
```

`previewData` es un **array JSON en la raíz** (`serializeRows` devuelve `rows.map(...)`,
`finance-imports.serde.ts:9-15`), no un objeto con clave `rows`: de ahí
`jsonb_array_elements(b."previewData")` directo, sin cast ni `->'rows'`. Los dos guardias
(`IS NOT NULL` y `jsonb_typeof = 'array'`) son defensa redundante —`serializeRows` siempre
emite un array— y no llegarán a dispararse; se dejan por baratos, no porque hagan falta.

Si aparecen filas, cada una nombra el archivo y el período de un ingreso que se perdió.
La recuperación es reimportar ese archivo **después** del backfill: con la deduplicación ya
acotada por empresa, las filas antes descartadas entran como nuevas y las demás se marcan
`DUPLICATE` correctamente. No hace falta recuperación manual.

> **Nota sobre `rowsValid`:** no sirve como señal de este daño. `confirmImport` lo
> **sobrescribe** con el conteo real de inserciones (`import-pipeline.service.ts:161`,
> `rowsValid: inserted`), así que comparar `rowsValid` contra el número de filas del lote
> daría cero siempre, por construcción. La señal está en `previewData`, no en los contadores.

**b) Dedupe intra-lote + confirm honesto.** En `parseRows`, un `Set` marca como
`DUPLICATE` toda fila cuyo `dedupeKey` ya apareció **antes en el mismo lote**. Con eso el
disparador desaparece en el preview, donde el CEO lo ve y lo entiende.

El `catch` de `P2002` en `createRow` deja de mentir: en vez de devolver `false`
(prometiendo un "salto" que la transacción no puede cumplir), lanza
`badRequest('Fila duplicada en el lote: <dedupeKey>')`. El rollback del lote completo es
el comportamiento **correcto** —la importación es atómica—; lo que estaba mal era el
código críptico 25P02 y la falsa promesa de resiliencia. `rowsDuplicated` se sigue
calculando desde la clasificación del preview, que es exacta.

**Tests:** archivo con dos filas idénticas → ambas parseadas, la segunda `DUPLICATE`, el
confirm inserta una sola y no revienta. Dos empresas con mismo folio+RUT+fecha+monto →
ambas se insertan (hoy: la segunda se pierde). Backfill idempotente (correrlo dos veces
deja el mismo estado).

**c) Los lotes en `PREVIEW` que sobreviven a una migración.** `confirmImport` reproduce los
`dedupeKey` congelados en `previewData` en el momento del preview (`:135`). Un lote que
quede en `PREVIEW` **antes** de desplegar la Fase 1 y se confirme **después** insertaría
filas con claves **sin el prefijo de empresa**, que el backfill ya no va a alcanzar:
quedarían permanentemente fuera de la deduplicación futura e invisibles. La Fase 2 tiene el
mismo peligro con `periodStart`/`periodEnd`, que esos lotes no traen.

**Disposición:** ambas migraciones (Fase 1 y Fase 2) cierran los lotes colgados:

```sql
UPDATE financial_import_batches SET status = 'FAILED' WHERE status = 'PREVIEW';
```
Un lote en `PREVIEW` es un archivo subido y no confirmado: material desechable, sin ninguna
fila en la BD. Cerrarlo no pierde nada —el archivo se vuelve a subir en diez segundos— y
`FAILED` ya existe en `FinancialImportStatus` (`schema.prisma:138-142`). La alternativa
(rechazar en el confirm los lotes anteriores a la migración) exige comparar timestamps
contra la fecha de despliegue: más código y más frágil, para el mismo resultado.

**Dos consecuencias, aceptadas a conciencia:**
- `FAILED` pasa a significar dos cosas: "el archivo no se pudo parsear" y "el lote quedó
  obsoleto por una actualización". Se acepta antes que añadir un estado nuevo al enum por
  un evento que ocurre dos veces en la vida del proyecto. Como `listBatches` no filtra por
  estado, tras cada despliegue el historial mostrará algún `FAILED` extra.
- `confirmImport:132` lanza `'El lote ya fue confirmado o no está disponible'`, que para
  este caso es técnicamente cierto pero confuso: el lote ni se confirmó ni falló al
  parsear. Se añade una rama para `status === 'FAILED'` con un mensaje honesto —*"Este lote
  quedó obsoleto por una actualización del sistema; vuelve a subir el archivo"*—. Dos
  líneas, y evitan un rato de desconcierto justo después de un despliegue.

### 3. El lote con rango explícito

**Esquema** (`FinancialImportBatch`, `schema.prisma:749`):

```diff
- periodMonth  DateTime
+ periodStart  DateTime   // rango declarado, inclusivo
+ periodEnd    DateTime   // rango declarado, inclusivo
+ dataStart    DateTime?  // min real de las fechas de las filas
+ dataEnd      DateTime?  // max real de las fechas de las filas
```
Índices: `@@index([periodStart, periodEnd])` reemplaza a `@@index([periodMonth])`.

**Convención:** `periodStart`/`periodEnd` son **fechas de calendario inclusivas** a
medianoche UTC —misma convención que `incomeDate`, `dueDate` y todas las fechas del
esquema—. "Del 6 al 12 de julio" se guarda literalmente como 6 y 12. Un helper
(`inclusiveToHalfOpen`) las convierte al rango semiabierto al consultar. No se mezclan
convenciones dentro del modelo, que es donde viven los off-by-one.

**Migración de datos:** `periodStart = periodMonth`, `periodEnd = último día de ese mes`.
Los lotes existentes quedan descritos correctamente. `dataStart`/`dataEnd` quedan `NULL`
para ellos: son nullable precisamente porque no se pueden reconstruir sin reparsear los
archivos, y `NULL` dice la verdad ("no lo sé") en vez de inventar un rango.

**Zod** (`finance-imports.schema.ts:36`): `periodMonth: z.coerce.date()` →
`periodStart` y `periodEnd`, con `.refine(periodStart <= periodEnd)`.
`normalizePeriodMonth` (`import-pipeline.service.ts:436`) se elimina.

**Ojo con el helper:** `dateInput` (`shared/zod.ts:7-10`) es `.optional().nullable()` —
aceptaría un rango ausente, que es exactamente lo que la Decisión 3 prohíbe. Se añade a
`shared/zod.ts` un `requiredDateInput` (el mismo `union` sin `.optional().nullable()`) y
`periodStart`/`periodEnd` lo usan. Usar `dateInput` aquí sería un fallo silencioso: el lote
quedaría sin período y la cobertura (§5) no podría contarlo.

**Tres advertencias nuevas en el preview** (advertencias, **no** bloqueos: el CEO confirma):

| Condición | Mensaje |
|---|---|
| `dataStart < periodStart` o `dataEnd > periodEnd` | *"Declaraste 6–12 jul, pero hay N filas fuera de ese rango (desde 28 jun)"* |
| `sourceHash` ya existe en un lote `CONFIRMED` | *"Este archivo ya se importó el 8 de julio"* |
| El rango declarado no es una semana ISO completa | *"El rango no cubre una semana completa (lun–dom)"* |

`sourceHash` hoy se calcula y se guarda (`import-pipeline.service.ts:61`) y **jamás se
consulta**; la primera advertencia cuesta una query. Ninguna es bloqueante: hay motivos
legítimos para reimportar un archivo o declarar un rango parcial.

**Frontend** (`FinanceImportsTab.tsx:134`): el `<Input type="month">` pasa a dos
`<Input type="date">` (desde/hasta) con atajos **"Semana pasada"** y **"Esta semana"** que
rellenan lunes–domingo de un clic. La cadencia semanal tiene que ser barata de operar o no
se sostiene. La tabla de historial muestra el rango en vez del mes.

### 4. Las vistas semanales

Todos los endpoints de finanzas cambian `month: '2026-07'` por el par
`granularity: 'week' | 'month'` + `period: '2026-W28' | '2026-07'`.

**Zod compartido** (`modules/shared/zod.ts`, elimina las 4 copias de la regex):

```ts
export const granularity = z.enum(['week', 'month']);
export const periodKeyInput = z.string().regex(/^\d{4}-(W(0[1-9]|[1-4]\d|5[0-3])|(0[1-9]|1[0-2]))$/);
```
Validación cruzada: `.refine()` que exija que la forma de `period` case con `granularity`.

**La regex no basta para las semanas y no puede bastar.** `W53` es válida en 2026 (que
tiene 53 semanas ISO) e inexistente en 2025 (que tiene 52), y una regex no sabe de qué año
habla. La comprobación real vive en `periodRange`, que lanza
`badRequest('Semana inexistente: 2025-W53')` cuando el número excede las semanas ISO de ese
año. Silenciosamente rodar a `2026-W01` sería peor que fallar.

**`periodRange` valida también los meses, desde la Fase 0.** Hoy `monthRange('2026-13')`
devuelve enero de 2027 en silencio; `periodRange('month', '2026-13')` lanzará `badRequest`.
Formalmente es un cambio de comportamiento dentro de una fase que promete no tener ninguno,
así que conviene dejarlo dicho en vez de que aparezca por sorpresa: **es inobservable** —la
regex de Zod impide que una clave así llegue al backend, y ningún test existente la ejerce—.
Se hace igualmente porque dejar una granularidad validada y la otra no es la clase de
asimetría que alguien "arregla" seis meses después sin saber por qué estaba así.

Rutas **reales** (el router de imports se monta en `/finance/imports`, `routes/index.ts:60`;
el de finance en `/finance`, `:59`):

| Endpoint (ruta real) | Antes | Después |
|---|---|---|
| `GET /finance/summary` | mes actual hardcodeado, sin parámetro | `?granularity&period`, ambos opcionales (default: período en curso) |
| `GET /finance/consolidated` | `?month` | `?granularity&period` |
| `POST /finance/reconciliation/auto` | `month?` | `granularity?&period?` |
| `POST /finance/reconciliation/recognize-transfers` | `month?` | `granularity?&period?` |
| `GET /income`, `GET /expenses` | `?month` | `?granularity&period` |
| `GET /income/months` | — | → `GET /income/periods?granularity` |
| `GET /expenses/months` | — | → `GET /expenses/periods?granularity` |
| `GET /finance/imports/transactions` | `?month` | `?granularity&period` |
| `GET /finance/imports/transactions/months` | — | → `GET /finance/imports/transactions/periods?granularity` |
| `GET /finance/imports/transactions/monthly` | — | → `GET /finance/imports/transactions/periodic?granularity` |
| `GET /finance/imports/transactions/by-category` | `?month` | `?granularity&period` |
| `GET /finance/trend` | — | **nuevo**: `?granularity&last=12` |
| `GET /finance/imports/coverage` | — | **nuevo** (§5) |

Son **tres** endpoints estilo `listMonths`, no dos: además de `/income/months` y
`/expenses/months` está `/finance/imports/transactions/months`
(`finance-imports.routes.ts:41-44` → `listTransactionMonthsController`, consumido por
`useBankTransactionMonths`). Los tres pasan a `/periods`.

**Renombre de campo en la respuesta:** `listBankMonthly` devuelve hoy `{ month, ... }` por
fila y `types/banking.ts:81` lo refleja. En `/transactions/periodic` el campo pasa a
`period`. Es parte del mismo cambio, no un detalle cosmético: dejar `month` conteniendo
`2026-W28` sería exactamente el tipo de mentira que este trabajo viene a quitar.

**Dashboard.** `finance-summary.service.ts` deja de hardcodear el período y lo acepta del
cliente. El dashboard muestra **semana en curso y mes en curso lado a lado**: el pulso y la
verdad contable en la misma foto. **Se corrige además** la mezcla de granularidades: los
`groupBy(['category'])` y `groupBy(['organizationId'])` (`:60-79`) pasan a filtrar por el
mismo período que el resto de la respuesta.

**Bancos: la parte delicada.** `listBankMonthly` (`:189-251`) arrastra saldos hacia
adelante rellenando los períodos sin movimiento con la serie contigua de `monthRange(min,max)`
(`:318-331`). Esa serie se generaliza vía `periodSeries(g, …)` —misma lógica, otro paso—.
Es el código más intrincado del módulo y **hoy no tiene tests**: los tests de
caracterización del comportamiento mensual actual se escriben en la **Fase 0**, antes de
tocarlo.

**Conciliación.** `finance-reconciliation.service.ts` propaga el período en `:20`, `:157`
y `:357`, cada uno con su copia inline del parseo. Pasan a `periodRange`.

**Tendencia (nuevo).** `GET /finance/trend?granularity=week&last=12` → serie de
`{ period, income, expense, result }` sobre `periodSeries`, con los períodos sin datos en
cero (no ausentes: un hueco en la serie es información). Doce semanas por defecto: un
trimestre, suficiente para ver tendencia sin ruido.

**Frontend.** `MonthFilter.tsx` → `PeriodFilter.tsx` con selector de granularidad y
etiquetas legibles (*"Semana del 6 al 12 jul"*, no `2026-W28`), vía `periodLabel`.
Absorbe las dos copias de nombres de meses (`MonthFilter.tsx:3` y `ConsolidatedPosition.tsx:15`).
`LedgerTab.tsx` ya recibe su hook de períodos inyectado (`:20`), así que Cobrar y Pagar
salen casi gratis. Tipos en `types/banking.ts:81,125` y hooks en `hooks/finance-shared.ts:13`,
`useBankImports.ts`, `useIncome.ts:22`, `useExpenses.ts:22`, `useReconciliation.ts`.

### 5. Cobertura de importación

Responde la pregunta que hoy el sistema **no puede contestar de ninguna forma**:
*¿qué falta por cargar?*

`GET /finance/imports/coverage?organizationId&granularity&from&to` → para cada fuente y
cada período del rango: `covered` | `partial` | `missing`, calculado como la unión de los
`[periodStart, periodEnd]` de los lotes **`CONFIRMED`** (los `PREVIEW` no cuentan: subir un
archivo y no confirmarlo no es haber cargado nada).

**`from` y `to` son claves de período**, no fechas: mismo `periodKeyInput` que el resto de
la API, expandidas con `periodSeries(g, from, to)`. Mezclar fechas y claves en la misma API
sería justo la clase de ambigüedad que este trabajo viene a quitar.

**Los tres estados**, según el solape entre el período y la unión de rangos cargados:
`covered` = el período cae **entero** dentro de la unión; `partial` = solape parcial
(cargaste 3 de los 7 días); `missing` = solape nulo.

```ts
type CoverageCell = { period: string; status: 'covered' | 'partial' | 'missing' };
type CoverageRow  = {
  source: { type: FinancialImportType; bankAccountId?: string; label: string };
  cells: CoverageCell[];
};
```

**Dos detalles que definen si sirve o estorba:**

- **La cobertura bancaria es por cuenta, no por empresa.** Cada `BankAccount` tiene su
  propia cartola; tener la del Santander no dice nada de la del BCI. Agregar ambas bajo
  "BANK_STATEMENT" de la empresa pintaría verde justo cuando falta algo. Se desglosa por
  cuenta: una fila por `BankAccount` activa.
- **Una semana sin ventas cuenta como cubierta.** Un lote confirmado con cero filas
  válidas **prueba** que esa semana se miró. Es exactamente la razón por la que el rango
  declarado gana al derivado (Decisión 3), y aquí es donde se paga.

**Frontend:** grilla en `FinanceImportsTab` — filas = fuentes (ventas, compras, y una por
cuenta bancaria), columnas = últimas 12 semanas, celdas verde/ámbar/gris. Un hueco gris
salta a la vista en medio segundo, que es todo el tiempo que se le va a dedicar.

## Fases

Cinco fases, **cada una mergeable a `develop` por su cuenta**. Si se para en cualquier
punto, lo entregado sigue en pie y tiene valor.

| # | Qué | Por qué en ese orden | Verificación |
|---|---|---|---|
| **0** | `shared/period.ts` + tests. Las 5 copias inline pasan a `periodRange('month', …)`. `listMonths` y `listBankTransactionMonths` se absorben en `listPeriods`. **`ledger.ts` conserva `monthRange` y `listMonths` como shims** (ver abajo). Tests de caracterización de `listBankMonthly`. | **Cero cambio de comportamiento.** Refactor puro con los 199 tests actuales de red. Si algo se pone rojo, es un error de implementación, no una ambigüedad del diseño. | `npm test` verde (199) **sin modificar tests existentes** |
| **1** | Deduplicación: diagnóstico → `organizationId` en la clave → dedupe intra-lote → confirm honesto → backfill SQL. | Sobre la BD **antes** de multiplicar por ~4 el número de importaciones. Aislada del resto. | `npm test` + conteos antes/después del backfill |
| **2** | `periodMonth` → `periodStart`/`periodEnd` + `dataStart`/`dataEnd`. Advertencias del preview. Selectores de fecha en el frontend. | **Aquí el sistema ya hace lo pedido** (carga semanal), aunque el análisis siga mensual. | `npm test` + `npm run lint` + `/verify` |
| **3** | Granularidad semanal en endpoints + `PeriodFilter`. Dashboard, libros, bancos, conciliación. **Eliminar `currentMonthRange`** (→ `currentPeriod('month')`) **y los dos shims de `ledger.ts`**, moviendo sus `describe` a `period.test.ts`. | La lente semanal. La fase más ancha, pero mecánica y con el typecheck cazando cada sitio. Aquí `finance-summary` empieza a aceptar período, que es donde el cambio de zona horaria tiene sentido y test. | `npm test` + `npm run lint` + `/verify` |
| **4** | Tendencia de 12 semanas + grilla de cobertura. | Lo único nuevo. Va al final porque se apoya en todo lo anterior. | `npm test` + `npm run lint` + `/verify` |

### Los shims de `ledger.ts` en la Fase 0

`test/ledger.test.ts:4` importa **`monthRange` y `listMonths`** desde `shared/ledger`, y los
prueba directamente en sendos `describe` (`:34-40` y `:42-60`). Si la Fase 0 los *moviera*
a `period.ts`, ese import se rompería y el criterio "sin modificar tests existentes" sería
imposible de cumplir: la fase no podría verificarse contra su propia definición.

Solución: en la Fase 0, `ledger.ts` conserva **ambos nombres** como alias delgados sobre
`period.ts`:

```ts
import { periodRange, listPeriods } from './period';

export const monthRange = (month: string) => periodRange('month', month);
export const listMonths = (source: 'income' | 'expense', organizationId?: string) =>
  listPeriods('month', { source, organizationId });
```

`ledger.test.ts` no se toca, los 199 tests siguen verdes y la absorción es real —hay una
sola implementación de cada cosa— aunque los símbolos sigan visibles desde su casa antigua.

**Los alias viven en `ledger.ts`, no reexportados desde `period.ts`.** Así `period.ts` nunca
carga los nombres heredados que viene a jubilar, su interfaz es la de arriba y nada más, y
borrar los shims en la Fase 3 es editar un solo archivo.

**`listBankTransactionMonths` no necesita shim:** ningún test lo importa (verificado), así
que en la Fase 0 pasa a delegar en `listPeriods('month', { source: 'bank', … })`
directamente. Su único consumidor es el controller.

Es la **estrategia de barrel re-export** que ya usa este código: `frontend/src/hooks/useFinance.ts:1-3`
lo dice en su propia cabecera —*"Barrel de compatibilidad… para no romper los imports
existentes"*— y así se hicieron las Fases 2 y 3 del refactor anterior de Finanzas. Los shims
mueren en la **Fase 3**, cuando `ledger.ts` deja de tener razones para existir como fachada
del mes y los dos `describe` se mudan a `period.test.ts`.

**Punto de corte:** si hay que recortar, las fases **0 → 2 → 3** entregan carga y análisis
semanal, y dejan fuera el backfill de deduplicación (Fase 1) y la cobertura (Fase 4).

## Riesgos y mitigaciones

**1. El backfill sobre finanzas reales (Fase 1).** Único paso genuinamente irreversible.
El VPS despliega con `prisma migrate deploy`, sin ventana de confirmación: la migración
tiene que estar bien a la primera.

*Mitigación:* `pg_dump` antes de nada. El `UPDATE` no puede violar el unique **por
construcción** (§2), así que el riesgo no es que la migración falle: es que oculte un daño
anterior. Por eso la fase **empieza** por la query de diagnóstico sobre `previewData` (§2),
que busca ingresos ya perdidos por la deduplicación sin empresa; si arroja > 0 filas, **se
para y se informa al CEO antes de seguir**, porque cada fila nombra un archivo a reimportar
después del backfill. El `UPDATE` es idempotente (cláusula `NOT LIKE`) y el alcance es
conocido y total: toca **todas** las filas con `sourceDedupeKey` no nulo de `income_records`
y `expense_records`. Verificación posterior: el conteo de filas de ambas tablas no cambia
(el backfill reescribe claves, no inserta ni borra) y ninguna clave queda sin prefijo.

**1b. La ventana del despliegue (aceptada, no mitigada).** `deploy.sh` corre
`prisma migrate deploy` y después reinicia el servicio: entre ambos, el parser viejo está
vivo contra una BD ya migrada, y una importación en ese hueco escribiría claves sin prefijo.
Dura segundos, hay un solo usuario y ese usuario es quien despliega. Se acepta a
conciencia; construir para esto sería desproporcionado.

**2. `listBankMonthly` y su arrastre de saldos.** La lógica más intrincada del módulo, sin
un solo test, y se va a generalizar a semanas.
*Mitigación:* tests de caracterización en la **Fase 0**, antes de tocarla. Primero la red,
después el trapecio.

**3. El frontend no tiene tests.** `PeriodFilter` toca ocho páginas y el typecheck es el
único lint.
*Mitigación:* `/verify` con Playwright al final de las fases 2, 3 y 4 —login y recorrido
real de las pestañas—, como ya se hizo en la Fase 4 del refactor anterior de Finanzas.

**4. Bordes de semana ISO.** `2026-W01` empieza el 29-dic-2025.
*Mitigación:* tests explícitos en ambos sentidos del cambio de año; `IYYY`/`IW` en SQL (no
`YYYY`/`WW`, que producen un resultado distinto justo en el borde).

**5. Dos migraciones de esquema** (Fase 1 y Fase 2).
*Mitigación:* separadas a propósito. Dos migraciones pequeñas y verificables por separado
son más seguras que una grande; y si la Fase 2 se atrasa, la Fase 1 ya está desplegada y
estable.

## Fuera de alcance (deliberado)

- **Alertas y notificaciones.** La grilla de cobertura es pasiva y se ve al entrar a
  importar, que es justo cuando sirve. Un sistema de alertas tiene su propia complejidad
  (¿cuándo avisa? ¿por dónde? ¿cómo se silencia?) y el CEO eligió "cargar y analizar
  semanal", no "que me avise". Spec propio si con el uso se echa de menos.
- **Granularidad diaria o trimestral.** `Granularity` es un enum cerrado de dos valores;
  añadir un tercero después es mecánico si hace falta.
- **Que el agente IA narre la semana.** `heuristic.ts:136,215` seguirá narrando el mes. El
  diseño deja el dato semanal disponible para que sea trivial después, pero es otro spec.
- **Refactor no relacionado.** El `useMemo` inerte de `PartyDetailPage` y demás deuda
  conocida quedan donde están.

## Notas de compatibilidad

- El parámetro `month` desaparece de la API (Decisión 7). Consumidores a actualizar en la
  misma fase: `frontend/src/hooks/{finance-shared,useIncome,useExpenses,useBankImports,useReconciliation,useFinanceSummary}.ts`
  y el barrel `frontend/src/hooks/useFinance.ts:4-15`, que reexporta `useIncomeMonths`,
  `useExpenseMonths`, `useBankTransactionMonths` y `useBankMonthly` (los cuatro se renombran
  a `…Periods` / `useBankPeriodic`). El typecheck caza cualquier olvido.
- `dashboard.service.ts:141-143` reexpone `monthIncome`/`monthExpense` del resumen: los
  nombres se conservan (siguen siendo el mes) y se **añaden** `weekIncome`/`weekExpense`.
  La capa de agente no se toca.
