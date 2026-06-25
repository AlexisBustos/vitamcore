# Emisión de ventas y cobranza — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la emisión del libro de ventas de la cobranza, vinculando notas de crédito a su factura, calculando el neto por cobrar y permitiendo registrar pagos manualmente, de modo que los KPIs financieros sean siempre coherentes.

**Architecture:** Se extiende `IncomeRecord` (no se crea modelo nuevo) con `netAmount`, `paidDate` y la auto-relación `creditsIncomeId` (NC→factura). El estado de cobranza se deriva de `netAmount`/`paidDate`/`dueDate`. La importación deja de adivinar el pago y vincula las NC en dos pasadas dentro de la transacción. Los KPIs se recalculan sobre el neto.

**Tech Stack:** Backend Express + Prisma (PostgreSQL) + TypeScript (`tsx`); frontend React + Vite + TanStack Query + Tailwind v4.

**Spec de referencia:** `docs/superpowers/specs/2026-06-25-ventas-emision-cobranza-design.md`

## Convención de verificación de este proyecto

No hay framework de tests. La verificación oficial es el typecheck:
- Backend: `cd backend && npm run build` (debe terminar sin errores).
- Frontend: `cd frontend && npm run lint` (es `tsc --noEmit`).

Para lógica pura nueva se incluyen verificaciones puntuales ejecutables con
`npx tsx <archivo>` y, para el flujo de importación, comprobaciones SQL contra la
BD de desarrollo (`docker exec vitamcore-postgres psql -U postgres -d vitamcore`).

**IMPORTANTE (PowerShell):** el cwd persiste entre comandos; usa rutas absolutas
o `Set-Location` explícito. Para SQL con identificadores entre comillas dobles,
usa `docker exec -i ... psql ... <<'SQL'` (heredoc) desde la Bash tool.

## File Structure

**Fase 1 — Modelo + importación**
- Modify: `backend/prisma/schema.prisma` (modelo `IncomeRecord`)
- Create: `backend/prisma/migrations/<timestamp>_sales_receivables/migration.sql` (vía `prisma migrate`)
- Modify: `backend/src/modules/shared/dates.ts` (helper `addMonths`)
- Modify: `backend/src/modules/finance-imports/finance-imports.parser.ts` (emisión sin pago, doc anulado, vencimiento)
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts` (vinculación NC→factura, `netAmount`)

**Fase 2 — KPIs + UI de resumen**
- Modify: `backend/src/modules/finance/finance.service.ts` (KPIs por cobrar/vencido/cobrado/emitido neto)
- Modify: `frontend/src/types/domain.ts` (`IncomeRecord`, `FinanceSummary`)
- Modify: `frontend/src/pages/finance/FinanceSummaryTab.tsx` (etiquetas/KPIs)

**Fase 3 — Cobranza**
- Modify: `backend/src/modules/income/income.schema.ts` (filtros + schema de pago)
- Modify: `backend/src/modules/income/income.service.ts` (registrar pago, filtros)
- Modify: `backend/src/modules/income/income.controller.ts` (controller de pago)
- Modify: `backend/src/modules/income/income.routes.ts` (ruta `PATCH /:id/payment`)
- Modify: `frontend/src/hooks/useFinance.ts` (`useRegisterPayment`, filtros)
- Create: `frontend/src/pages/finance/ReceivablesTab.tsx` (pestaña Cuentas por cobrar)
- Modify: `frontend/src/pages/finance/FinancePage.tsx` (registrar la pestaña)
- Modify: `frontend/src/types/domain.ts` (tipo de estado de cobranza si hace falta)

---

## Chunk 1: Fase 1 — Modelo de datos e importación

### Task 1: Migración del modelo `IncomeRecord`

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelo `IncomeRecord`, ~líneas 455-497)
- Create: `backend/prisma/migrations/<timestamp>_sales_receivables/migration.sql` (generada)

- [ ] **Step 1: Agregar campos y auto-relación al modelo `IncomeRecord`**

En `backend/prisma/schema.prisma`, dentro de `model IncomeRecord`, agrega los
campos nuevos (junto a `clientId`/`documentKind`) y la auto-relación:

```prisma
  clientId            String?
  documentKind        DocumentKind         @default(SALE)
  netAmount           Int?                 // neto por cobrar de la factura tras NC; null en NC
  paidDate            DateTime?            // fecha de cobro; null = por cobrar
  creditsIncomeId     String?              // en una NC: factura que anula
```

Y en la sección de relaciones del mismo modelo, **debajo de la línea `client` que ya existe** (no la dupliques), agrega solo las dos nuevas:

```prisma
  creditsIncome IncomeRecord?        @relation("CreditNotes", fields: [creditsIncomeId], references: [id], onDelete: SetNull)
  creditedBy    IncomeRecord[]       @relation("CreditNotes")
```

Y agrega el índice junto a los demás `@@index` del modelo:

```prisma
  @@index([creditsIncomeId])
  @@index([paidDate])
```

- [ ] **Step 2: Crear y aplicar la migración**

Run (desde `backend/`):
```bash
npm run prisma:migrate -- --name sales_receivables
```
Expected: crea `prisma/migrations/<timestamp>_sales_receivables/` y aplica sin
errores. Regenera el cliente Prisma automáticamente.

- [ ] **Step 3: Verificar el cliente Prisma regenerado**

Run (desde `backend/`):
```bash
npm run build
```
Expected: PASS (los nuevos campos existen en el tipo `IncomeRecord` de Prisma).

- [ ] **Step 4: Verificar columnas en la BD**

Run (Bash tool):
```bash
docker exec vitamcore-postgres psql -U postgres -d vitamcore -c '\d income_records' | grep -E 'netAmount|paidDate|creditsIncomeId'
```
Expected: aparecen las 3 columnas.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: agrega netAmount, paidDate y vinculo NC en IncomeRecord"
```

---

### Task 2: Helper de fecha `addMonths`

**Files:**
- Modify: `backend/src/modules/shared/dates.ts`
- Verify: `backend/src/modules/shared/dates.verify.ts` (temporal, se borra)

- [ ] **Step 1: Escribir verificación de la función pura**

Crea `backend/src/modules/shared/dates.verify.ts`:

```ts
import assert from 'node:assert';
import { addMonths } from './dates';

// Caso normal
assert.deepStrictEqual(
  addMonths(new Date(Date.UTC(2026, 0, 5)), 1),
  new Date(Date.UTC(2026, 1, 5)),
);
// Fin de mes (31 ene + 1 mes -> 28/29 feb, comportamiento de Date)
const r = addMonths(new Date(Date.UTC(2026, 0, 31)), 1);
assert.strictEqual(r.getUTCMonth(), 2); // marzo (overflow controlado por Date)
console.log('addMonths OK');
```

- [ ] **Step 2: Ejecutar para verla fallar**

Run (desde `backend/`): `npx tsx src/modules/shared/dates.verify.ts`
Expected: FAIL — `addMonths` no existe.

- [ ] **Step 3: Implementar `addMonths`**

En `backend/src/modules/shared/dates.ts`, añade:

```ts
/** Devuelve una nueva fecha sumando `months` meses (en UTC). */
export function addMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()),
  );
}
```

- [ ] **Step 4: Ejecutar la verificación**

Run (desde `backend/`): `npx tsx src/modules/shared/dates.verify.ts`
Expected: `addMonths OK`.

- [ ] **Step 5: Borrar el archivo de verificación y commitear**

```bash
rm backend/src/modules/shared/dates.verify.ts
git add backend/src/modules/shared/dates.ts
git commit -m "feat: agrega helper addMonths"
```

---

### Task 3: Parser — emisión sin estado de pago, doc anulado y vencimiento

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.parser.ts` (`parseSalesRows`, ~líneas 130-176)

- [ ] **Step 1: Importar `addMonths`**

Al inicio de `finance-imports.parser.ts`, agrega el import (ajusta a los imports
existentes del archivo):

```ts
import { addMonths } from '../shared/dates';
```

- [ ] **Step 2: Reescribir el `data` de cada fila de venta**

Dentro de `parseSalesRows`, reemplaza el objeto `data` (líneas ~158-173) por:

```ts
        data: {
          clientName: text(valueOf(row, 'RAZON SOCIAL')),
          description: `${documentType} ${folio}`.trim(),
          amount,
          currency: text(valueOf(row, 'TIPO DE MONEDA')) || 'CLP',
          category:
            documentKind === 'CREDIT_NOTE' ? 'Notas de crédito' : 'Ventas',
          documentKind,
          // Emisión: por cobrar; el libro NO declara cobranza, no se adivina pago.
          status: 'INVOICED',
          incomeDate: issueDate,
          // Vencimiento fijo a 1 mes desde la emisión (el libro lo trae vacío).
          dueDate: issueDate ? addMonths(issueDate, 1) : null,
          sourceDocumentType: documentType,
          sourceFolio: folio,
          sourceRut: rut,
          sourceIssueDate: issueDate,
          // Referencia de la factura anulada (solo NC).
          creditedFolio:
            documentKind === 'CREDIT_NOTE'
              ? text(valueOf(row, 'NRO DOCUMENTO ANULADO'))
              : '',
          creditedDocType:
            documentKind === 'CREDIT_NOTE'
              ? text(valueOf(row, 'TIPO DOCUMENTO ANULADO'))
              : '',
        },
```

(Se elimina la llamada `parsePaid(valueOf(row, 'PAGADO'))`.)

- [ ] **Step 3: Omitir filas no emitidas**

El tipo `ParsedImportRow['status']` es `'VALID' | 'WARNING' | 'DUPLICATE' | 'ERROR'`
(no existe un estado "skip"). Las filas con estado `'ERROR'` **no se insertan**
(`confirmImport` solo inserta `VALID`/`WARNING`) y se cuentan como omitidas, que
es justo el comportamiento deseado. Modifica el cálculo de `status` de la fila
(línea ~148) para marcar como `'ERROR'` las no emitidas:

```ts
      const emitido = upper(text(valueOf(row, 'EMITIDO'))) === 'SI';
      const warnings = [
        ...(!emitido ? ['Documento no emitido'] : []),
        ...(!issueDate ? ['Fila de venta sin fecha'] : []),
        ...(!folio ? ['Fila de venta sin folio'] : []),
        ...(!rut ? ['Fila de venta sin RUT'] : []),
      ];
      const status = !emitido
        ? ('ERROR' as const)
        : warnings.length > 0
        ? ('WARNING' as const)
        : ('VALID' as const);
```

(Reemplaza el array `warnings` existente por este, que añade "Documento no
emitido", y usa `status,` en el objeto devuelto en vez de la expresión inline.)

- [ ] **Step 4: Verificar el typecheck**

Run (desde `backend/`): `npm run build`
Expected: PASS.

- [ ] **Step 5: Verificar la clasificación y el vencimiento con un script puntual**

Crea `backend/src/modules/finance-imports/parser.verify.ts`:

```ts
import assert from 'node:assert';
import { parseSalesRows } from './finance-imports.parser';

const preview = parseSalesRows([
  {
    DOCUMENTO: 'FACTURA ELECTRONICA',
    FOLIO: '1971',
    RUT: '91.619.000-K',
    FECHA: '05-01-2026',
    TOTAL: 5000000,
    EMITIDO: 'SI',
    PAGADO: 'SI',
  },
  {
    DOCUMENTO: 'NOTA DE CREDITO ELECTRONICA',
    FOLIO: '818',
    RUT: '91.619.000-K',
    FECHA: '29-01-2026',
    TOTAL: -5000000,
    EMITIDO: 'SI',
    'NRO DOCUMENTO ANULADO': '1971',
  },
]);

const factura = preview.rows[0].data;
const nc = preview.rows[1].data;
assert.strictEqual(factura.status, 'INVOICED', 'factura debe quedar INVOICED');
assert.strictEqual(
  (factura.dueDate as Date).getUTCMonth(),
  1,
  'vencimiento = febrero (emisión + 1 mes)',
);
assert.strictEqual(nc.documentKind, 'CREDIT_NOTE');
assert.strictEqual(nc.creditedFolio, '1971', 'NC referencia folio 1971');
console.log('parser OK');
```

Run (desde `backend/`): `npx tsx src/modules/finance-imports/parser.verify.ts`
Expected: `parser OK`.

- [ ] **Step 6: Borrar la verificación y commitear**

```bash
rm backend/src/modules/finance-imports/parser.verify.ts
git add backend/src/modules/finance-imports/finance-imports.parser.ts
git commit -m "feat: parser de ventas registra emision y referencia de NC"
```

---

### Task 4: Service — persistir `netAmount` y vincular NC→factura

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts` (`createRow` ~líneas 415-450, `confirmImport` ~líneas 176-215)

- [ ] **Step 1: Persistir campos nuevos al crear una fila de venta**

En `createRow`, dentro del bloque `if (batch.type === FinancialImportType.SALES_REPORT)`,
en el `data` del `tx.incomeRecord.create`, agrega (junto a `documentKind`/`clientId`):

```ts
          documentKind: documentKindOf(row.data.documentKind),
          // Factura/ND nace con neto = monto; la NC no tiene neto propio.
          netAmount:
            documentKindOf(row.data.documentKind) === DocumentKind.CREDIT_NOTE
              ? null
              : numberOrDefault(row.data.amount),
          paidDate: null,
```

La vinculación NC→factura (Step 3) consulta los registros directamente desde la
BD por `importBatchId`, así que **no** es necesario que `createRow` devuelva el
registro creado. No cambies su firma de retorno.

- [ ] **Step 2: Implementar la vinculación en dos pasadas en `confirmImport`**

En `confirmImport`, dentro de la `prisma.$transaction`, después del bucle que
inserta las filas, agrega (solo para ventas):

```ts
    let linkWarnings: string[] = [];
    if (batch.type === FinancialImportType.SALES_REPORT) {
      linkWarnings = await linkCreditNotes(tx, batch.id, batch.organizationId);
    }
```

Y al hacer el `tx.financialImportBatch.update`, fusiona las advertencias de forma
segura (guardando contra un `warnings` nulo o no-arreglo):

```ts
        warnings: (() => {
          const prev = Array.isArray(batch.warnings) ? batch.warnings : [];
          const merged = [...prev, ...linkWarnings];
          return merged as Prisma.InputJsonValue;
        })(),
```

- [ ] **Step 3: Implementar `linkCreditNotes`**

La nota de crédito guarda el folio de la factura anulada en su `rawData` (clave
original del Excel). Para leerlo de forma robusta ante diferencias de
mayúsculas/espacios, agrega un pequeño helper de búsqueda case-insensitive y la
función de vinculación al final de `finance-imports.service.ts`:

```ts
/// Lee una clave de un objeto rawData ignorando mayúsculas y espacios extremos.
function rawValue(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const target = key.trim().toUpperCase();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.trim().toUpperCase() === target) {
      const s = stringOrNull(v);
      return s && s.trim() ? s.trim() : null;
    }
  }
  return null;
}

/// Segunda pasada: vincula cada nota de crédito del lote con la factura que
/// anula (por `NRO DOCUMENTO ANULADO`) y recalcula su neto. Devuelve
/// advertencias para folios ambiguos o sin factura encontrada.
async function linkCreditNotes(
  tx: Prisma.TransactionClient,
  batchId: string,
  organizationId: string,
): Promise<string[]> {
  const warnings: string[] = [];
  const creditNotes = await tx.incomeRecord.findMany({
    where: { importBatchId: batchId, documentKind: DocumentKind.CREDIT_NOTE },
    select: { id: true, amount: true, sourceFolio: true, rawData: true },
  });

  for (const nc of creditNotes) {
    const folio = rawValue(nc.rawData, 'NRO DOCUMENTO ANULADO');
    if (!folio) {
      warnings.push(`NC ${nc.sourceFolio ?? ''}: sin folio de documento anulado`);
      continue;
    }

    const candidates = await tx.incomeRecord.findMany({
      where: {
        organizationId,
        sourceFolio: folio,
        documentKind: { in: [DocumentKind.SALE, DocumentKind.DEBIT_NOTE] },
      },
      orderBy: { incomeDate: 'desc' },
      select: { id: true, amount: true, netAmount: true },
    });

    if (candidates.length === 0) {
      warnings.push(`NC ${nc.sourceFolio ?? ''}: factura ${folio} no encontrada`);
      continue;
    }
    if (candidates.length > 1) {
      warnings.push(
        `NC ${nc.sourceFolio ?? ''}: varias facturas con folio ${folio}, se usó la más reciente`,
      );
    }

    const factura = candidates[0];
    await tx.incomeRecord.update({
      where: { id: nc.id },
      data: { creditsIncomeId: factura.id },
    });
    // netAmount de la factura = su neto actual + monto (negativo) de la NC.
    const base = factura.netAmount ?? factura.amount;
    await tx.incomeRecord.update({
      where: { id: factura.id },
      data: { netAmount: base + nc.amount },
    });
  }

  return warnings;
}
```

Nota: `stringOrNull` y `numberOrDefault` ya existen en el archivo, y los imports
de `DocumentKind` y `Prisma` también.

- [ ] **Step 4: Verificar el typecheck**

Run (desde `backend/`): `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.service.ts
git commit -m "feat: vincula notas de credito a su factura y calcula neto"
```

---

### Task 5: Reimportar el libro 2026 y verificar el neto

**Files:** ninguno (verificación de datos sobre la BD de desarrollo).

- [ ] **Step 1: Limpiar las ventas 2026 actuales**

Run (Bash tool):
```bash
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore <<'SQL'
DELETE FROM income_records WHERE "incomeDate" >= '2026-01-01' AND "incomeDate" < '2027-01-01';
DELETE FROM financial_import_batches WHERE "periodMonth" >= '2026-01-01' AND "periodMonth" < '2027-01-01';
DELETE FROM clients;
SQL
```

- [ ] **Step 2: Reimportar el libro de ventas desde la UI**

Con backend (`npm run dev`) y frontend (`npm run dev`) corriendo, en
Finanzas → Importaciones, sube el libro de ventas 2026 y confirma.

- [ ] **Step 3: Verificar el neto y los vínculos**

Run (Bash tool):
```bash
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore <<'SQL'
-- Facturas: amount vs netAmount (las anuladas deben tener netAmount 0)
SELECT "documentKind", "sourceFolio", amount, "netAmount", "creditsIncomeId"
FROM income_records ORDER BY "documentKind", "sourceFolio";
-- Por cobrar = facturas no NC, no pagadas, netAmount>0 -> debe ser POSITIVO
SELECT COALESCE(SUM("netAmount"),0) AS por_cobrar
FROM income_records
WHERE "documentKind" <> 'CREDIT_NOTE' AND "paidDate" IS NULL AND "netAmount" > 0;
SQL
```
Expected: las facturas anuladas por una NC total tienen `netAmount = 0`; las NC
tienen `creditsIncomeId` apuntando a su factura; `por_cobrar` es **positivo**
(ya no −273.822).

- [ ] **Step 4: Commit (sin cambios de código; nota en el plan)**

No hay archivos que commitear. Marca el paso como verificación manual superada.

---

## Chunk 2: Fase 2 — KPIs y resumen financiero

### Task 6: Reescribir los KPIs de cobranza en `finance.service.ts`

**Files:**
- Modify: `backend/src/modules/finance/finance.service.ts` (constantes ~líneas 9-10, agregaciones `pendingIncome`/`overdueIncome` ~líneas 51-73, retorno ~líneas 157-189)

**Decisión de cálculo:** "por cobrar" y "vencido" se calculan en dos sumas que se
combinan en JS, para cubrir tanto ventas importadas (con `netAmount`/`paidDate`)
como ingresos manuales (con `status`, `netAmount = null`):
- **Ventas**: `documentKind != CREDIT_NOTE`, `netAmount > 0`, `paidDate IS NULL`.
- **Manuales**: `netAmount IS NULL`, `status IN (EXPECTED, INVOICED, OVERDUE)`.

> **⚠️ ALINEACIÓN POSICIONAL — leer antes de empezar.** El `Promise.all` y su
> array de destructuring son **posicionales**: el N-ésimo nombre recibe el
> N-ésimo resultado. Todas las llamadas `prisma.*.aggregate(...)` devuelven
> objetos de la **misma forma**, por lo que un nombre mal alineado **compila sin
> error** y produce KPIs incorrectos en silencio. Aplica los cambios de array y de
> destructuring **juntos** y verifica índice por índice antes de compilar.

- [ ] **Step 1: Reescribir el array de destructuring (líneas ~17-32)**

Reemplaza el bloque `const [ ... ] = await Promise.all([` por exactamente estos
17 nombres, en este orden:

```ts
  const [
    monthIncome,
    monthExpense,
    pendingSales,      // (antes pendingIncome) — dividido en ventas + manuales
    pendingManual,
    pendingExpense,
    recurringIncome,
    recurringExpense,
    overdueSales,      // (antes overdueIncome) — dividido en ventas + manuales
    overdueManual,
    overdueExpense,
    incomeByCategory,
    expenseByCategory,
    incomeByOrg,
    expenseByOrg,
    upcomingIncome,
    upcomingExpense,
    collectedIncome,   // nuevo — va al final
  ] = await Promise.all([
```

- [ ] **Step 2: Sustituir la agregación `pendingIncome` por dos (en su misma posición)**

En el array del `Promise.all`, donde hoy está la agregación de `pendingIncome`
(la 3.ª, líneas ~51-54), reemplázala por estas **dos** (que ocupan las posiciones
3 y 4; `pendingExpense` sigue inmediatamente después):

```ts
    // Por cobrar (ventas): neto positivo, no pagado, excluye notas de crédito.
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        paidDate: null,
        netAmount: { gt: 0 },
      },
    }),
    // Por cobrar (ingresos manuales): sin neto calculado, por estado clásico.
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, netAmount: null, status: { in: INCOME_PENDING } },
    }),
```

- [ ] **Step 3: Sustituir la agregación `overdueIncome` por dos (en su misma posición)**

Donde hoy está `overdueIncome` (líneas ~69-73), reemplázala por estas dos
(posiciones 8 y 9; `overdueExpense` sigue inmediatamente después):

```ts
    // Vencido (ventas): por cobrar con dueDate pasado.
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        paidDate: null,
        netAmount: { gt: 0 },
        dueDate: { lt: now },
      },
    }),
    // Vencido (manuales).
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...orgFilter,
        netAmount: null,
        status: { in: INCOME_PENDING },
        dueDate: { lt: now },
      },
    }),
```

- [ ] **Step 4: Agregar la agregación "cobrado" como ÚLTIMO elemento del array**

Como **último** elemento del `Promise.all` (después de `upcomingExpense`), agrega
(corresponde al nombre `collectedIncome`, también el último del destructuring):

```ts
    // Cobrado: facturas con pago registrado.
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: { ...orgFilter, paidDate: { not: null } },
    }),
```

- [ ] **Step 5: Combinar en el retorno**

En el objeto de retorno (líneas ~157-189), sustituye las propiedades
`pendingIncome` y `overdueIncome`, y agrega `collectedIncome`:

```ts
    pendingIncome:
      (pendingSales._sum.netAmount ?? 0) + (pendingManual._sum.amount ?? 0),
    collectedIncome: collectedIncome._sum.netAmount ?? 0,
    overdueIncome: {
      count: overdueSales._count._all + overdueManual._count._all,
      amount:
        (overdueSales._sum.netAmount ?? 0) + (overdueManual._sum.amount ?? 0),
    },
```

`monthIncome` (emitido neto del mes) **no cambia**: ya suma `amount` de todos los
documentos del mes con `status != CANCELLED`, agrupando por `incomeDate`, e
incluye las NC negativas → cuadra en 0 para una factura anulada.

- [ ] **Step 6: Verificar el typecheck**

Run (desde `backend/`): `npm run build`
Expected: PASS.

- [ ] **Step 7: Verificar el KPI contra la BD**

Con el backend corriendo y sesión iniciada, o vía SQL equivalente al Step 3 de la
Task 5, confirma que `pendingIncome` del endpoint `/api/finance/summary` es
**positivo** y coincide con la suma de netos por cobrar.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/finance/finance.service.ts
git commit -m "feat: KPIs de cobranza usan neto y excluyen notas de credito"
```

---

### Task 7: Tipos y UI del resumen financiero

**Files:**
- Modify: `frontend/src/types/domain.ts` (`IncomeRecord`, `FinanceSummary`)
- Modify: `frontend/src/pages/finance/FinanceSummaryTab.tsx`

- [ ] **Step 1: Extender el tipo `IncomeRecord`**

En `frontend/src/types/domain.ts`, en `interface IncomeRecord` (junto a
`clientId`/`documentKind`), agrega:

```ts
  netAmount: number | null;
  paidDate: string | null;
  creditsIncomeId: string | null;
```

Y, si aún no está declarado en la interfaz, agrega también `sourceFolio`, que la
pestaña de Cuentas por cobrar (Chunk 3) lee de cada fila:

```ts
  sourceFolio: string | null;
```

- [ ] **Step 2: Extender `FinanceSummary`**

Localiza `interface FinanceSummary` en `domain.ts` y agrega el campo nuevo
`collectedIncome: number;` (junto a `pendingIncome`). Mantén `pendingIncome` y
`overdueIncome` con sus tipos actuales.

- [ ] **Step 3: Ajustar las etiquetas y agregar "Cobrado" en el resumen**

En `FinanceSummaryTab.tsx`:
- La tarjeta que hoy muestra `summary.pendingIncome` (busca el `MetricCard` con
  título "Ingresos pendientes", ~línea 46): renombra su título a **"Por cobrar"**.
  No cambies el valor (`summary.pendingIncome` ya viene corregido del backend).
- Agrega una tarjeta **"Cobrado"** con `summary.collectedIncome` usando el mismo
  componente `MetricCard`. **No** la metas en el grid de 4 columnas
  (`lg:grid-cols-4`), que ya está lleno; colócala en el bloque de "vencidos"
  (~líneas 65-79) o en una fila propia, para no desbordar la grilla.
- Verifica que el bloque de vencidos siga leyendo `summary.overdueIncome.amount`
  y `.count` (su forma no cambió).

- [ ] **Step 4: Actualizar el Dashboard si consume estos KPIs**

Revisa `frontend/src/pages/DashboardPage.tsx`: si muestra "ingresos pendientes"
o "vencidos" desde `useFinanceSummary`/`FinanceSummary`, renombra la etiqueta a
**"Por cobrar"** para mantener consistencia (los valores ya vienen corregidos del
backend). Si el Dashboard **no** consume esos campos, anota "sin cambios" y
continúa.

- [ ] **Step 5: Verificar el typecheck del frontend**

Run (desde `frontend/`): `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/pages/finance/FinanceSummaryTab.tsx frontend/src/pages/DashboardPage.tsx
git commit -m "feat: resumen y dashboard muestran por cobrar y cobrado"
```

---

## Chunk 3: Fase 3 — Cobranza (registro de pago + pestaña)

### Task 8: Backend — endpoint de pago y filtros de cobranza

**Files:**
- Modify: `backend/src/modules/income/income.schema.ts`
- Modify: `backend/src/modules/income/income.service.ts`
- Modify: `backend/src/modules/income/income.controller.ts`
- Modify: `backend/src/modules/income/income.routes.ts`

- [ ] **Step 1: Agregar schemas de pago y filtros**

En `income.schema.ts`, agrega:

```ts
export const registerPaymentSchema = z.object({
  paidDate: dateInput.nullable(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;
```

Y extiende `listIncomeQuery` con dos filtros opcionales:

```ts
  documentKind: z.enum(['SALE', 'CREDIT_NOTE', 'DEBIT_NOTE']).optional(),
  paymentState: z.enum(['receivable', 'overdue', 'paid', 'cancelled']).optional(),
```

- [ ] **Step 2: Implementar `registerPayment` y filtros en el service**

En `income.service.ts`, agrega:

```ts
import { badRequest, notFound } from '../../utils/http-error';

export async function registerPayment(id: string, input: RegisterPaymentInput) {
  const rec = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { id: true, documentKind: true, netAmount: true },
  });
  if (!rec) throw notFound('Ingreso no encontrado');
  if (rec.documentKind === 'CREDIT_NOTE') {
    throw badRequest('Una nota de crédito no se cobra');
  }
  if (rec.netAmount === 0) {
    throw badRequest('Una factura anulada no se cobra');
  }
  return prisma.incomeRecord.update({
    where: { id },
    data: {
      paidDate: input.paidDate,
      status: input.paidDate ? 'PAID' : 'INVOICED',
    },
  });
}
```

Importa el tipo `RegisterPaymentInput` desde `./income.schema`.

En la función `list`, traduce `paymentState`/`documentKind` a `where`. El filtro
explícito `documentKind` tiene **precedencia**; los estados que excluyen notas de
crédito solo aplican `{ not: 'CREDIT_NOTE' }` cuando no se pidió un `documentKind`
concreto, para no pisarse:

```ts
  if (filters.documentKind) where.documentKind = filters.documentKind;
  const now = new Date();
  const excludeNC = () => {
    if (!filters.documentKind) where.documentKind = { not: 'CREDIT_NOTE' };
  };
  if (filters.paymentState === 'receivable') {
    excludeNC();
    where.paidDate = null;
    where.netAmount = { gt: 0 };
  } else if (filters.paymentState === 'overdue') {
    excludeNC();
    where.paidDate = null;
    where.netAmount = { gt: 0 };
    where.dueDate = { lt: now };
  } else if (filters.paymentState === 'paid') {
    where.paidDate = { not: null };
  } else if (filters.paymentState === 'cancelled') {
    where.netAmount = 0;
  }
```

La tabla muestra el cliente con el escalar `clientName` (ya presente en
`IncomeRecord`), así que **no** es necesario tocar el objeto `refs`.

- [ ] **Step 3: Controller de pago**

En `income.controller.ts`, agrega:

```ts
import { registerPaymentSchema } from './income.schema';

export async function registerPaymentController(req: Request, res: Response) {
  const input = registerPaymentSchema.parse(req.body);
  res.json({ data: await service.registerPayment(req.params.id, input) });
}
```

- [ ] **Step 4: Ruta**

En `income.routes.ts`, agrega (antes del `export` o junto a las demás):

```ts
incomeRouter.patch('/:id/payment', asyncHandler(registerPaymentController));
```

e impórtala en el bloque de imports del controller. Colócala **antes** de
`patch('/:id', ...)` no es necesario (rutas distintas), pero mantén el orden
legible.

- [ ] **Step 5: Verificar el typecheck**

Run (desde `backend/`): `npm run build`
Expected: PASS.

- [ ] **Step 6: Verificar el endpoint manualmente**

Con el backend corriendo y sesión iniciada, toma el `id` de una factura por
cobrar y:
```bash
# marcar pagada
curl -s -X PATCH http://localhost:4000/api/income/<ID>/payment \
  -H 'Content-Type: application/json' --cookie '<cookie>' \
  -d '{"paidDate":"2026-01-28"}'
# revertir
curl -s -X PATCH http://localhost:4000/api/income/<ID>/payment \
  -H 'Content-Type: application/json' --cookie '<cookie>' -d '{"paidDate":null}'
```
Expected: la primera devuelve la factura con `paidDate` y `status: PAID`; la
segunda la revierte. Una NC o factura anulada devuelve 400.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/income
git commit -m "feat: endpoint para registrar pago de facturas y filtros de cobranza"
```

---

### Task 9: Frontend — hook `useRegisterPayment` y pestaña "Cuentas por cobrar"

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts`
- Create: `frontend/src/pages/finance/ReceivablesTab.tsx`
- Modify: `frontend/src/pages/finance/FinancePage.tsx`

- [ ] **Step 1: Agregar el filtro `paymentState`/`documentKind` al tipo de filtros**

En `useFinance.ts`, extiende `FinanceFilters`:

```ts
  documentKind?: string;
  paymentState?: 'receivable' | 'overdue' | 'paid' | 'cancelled';
```

- [ ] **Step 2: Agregar `useRegisterPayment`**

En `useFinance.ts`, junto a las mutaciones de ingresos:

```ts
export function useRegisterPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; paidDate: string | null }) =>
      api.patch(`/income/${payload.id}/payment`, { paidDate: payload.paidDate }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
```

(`invalidateFinance` ya invalida `income`, `expenses`, `finance` y `dashboard`.)

- [ ] **Step 3: Crear `ReceivablesTab.tsx`**

Crea `frontend/src/pages/finance/ReceivablesTab.tsx` con una tabla de facturas
por cobrar. Reutiliza `useIncome` con `paymentState`, `formatMoney` y los
componentes de tabla/estado que ya use `FinanceImportsTab.tsx` (revisa sus
imports de UI para no inventar componentes). Estructura mínima:

```tsx
import { useState } from 'react';
import { useIncome, useRegisterPayment } from '@/hooks/useFinance';
import { formatMoney } from '@/lib/domain';

type Estado = 'receivable' | 'overdue' | 'paid' | 'cancelled';

export function ReceivablesTab({ organizationId }: { organizationId?: string }) {
  const [estado, setEstado] = useState<Estado>('receivable');
  const { data: rows = [], isLoading } = useIncome({
    organizationId,
    paymentState: estado,
  });
  const registrar = useRegisterPayment();

  const total = rows.reduce((s, r) => s + (r.netAmount ?? r.amount), 0);

  return (
    <div className="space-y-4">
      {/* Filtro de estado */}
      <div className="flex gap-2">
        {(['receivable', 'overdue', 'paid', 'cancelled'] as Estado[]).map((e) => (
          <button key={e} onClick={() => setEstado(e)}>
            {labelEstado(e)}
          </button>
        ))}
      </div>

      <div>Total: {formatMoney(total)}</div>

      {isLoading ? (
        <p>Cargando…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Folio</th>
              <th>Emisión</th>
              <th>Vence</th>
              <th className="text-right">Neto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.clientName ?? '—'}</td>
                <td>{r.sourceFolio ?? '—'}</td>
                <td>{r.incomeDate?.slice(0, 10) ?? '—'}</td>
                <td>{r.dueDate?.slice(0, 10) ?? '—'}</td>
                <td className="text-right">{formatMoney(r.netAmount ?? r.amount)}</td>
                <td>
                  {r.paidDate ? (
                    <button
                      onClick={() =>
                        registrar.mutate({ id: r.id, paidDate: null })
                      }
                    >
                      Revertir
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        registrar.mutate({
                          id: r.id,
                          paidDate: new Date().toISOString().slice(0, 10),
                        })
                      }
                    >
                      Marcar pagada
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function labelEstado(e: Estado) {
  return {
    receivable: 'Por cobrar',
    overdue: 'Vencidas',
    paid: 'Pagadas',
    cancelled: 'Anuladas',
  }[e];
}
```

Ajusta clases/estilos para que coincidan con las otras tabs (copia el patrón de
tabla y botones de `FinanceImportsTab.tsx`). Verifica que `formatMoney` exista en
`@/lib/domain` (lo usa `FinanceImportsTab`).

- [ ] **Step 4: Registrar la pestaña en `FinancePage.tsx`**

En `FinancePage.tsx`:
- Importa `ReceivablesTab`.
- Agrega `'receivables'` al tipo `Tab`.
- Agrega `{ id: 'receivables', label: 'Cuentas por cobrar' }` a `TABS` (después de
  `summary`).
- Agrega `{tab === 'receivables' && <ReceivablesTab organizationId={organizationId} />}`.

- [ ] **Step 5: Verificar el typecheck del frontend**

Run (desde `frontend/`): `npm run lint`
Expected: PASS.

- [ ] **Step 6: Verificación end-to-end manual**

Con backend y frontend corriendo:
1. Finanzas → Cuentas por cobrar → filtro "Por cobrar": aparecen las facturas con
   neto > 0; el total es positivo.
2. "Marcar pagada" en una factura → desaparece de "Por cobrar" y aparece en
   "Pagadas"; el KPI "Por cobrar" del Resumen baja.
3. "Revertir" la devuelve a "Por cobrar".
4. Filtro "Anuladas": muestra las facturas con `netAmount = 0`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useFinance.ts frontend/src/pages/finance/ReceivablesTab.tsx frontend/src/pages/finance/FinancePage.tsx
git commit -m "feat: pestana Cuentas por cobrar con registro de pago"
```

---

## Cierre

- [ ] **Verificación final**: `cd backend && npm run build` y `cd frontend && npm run lint`, ambos en verde.
- [ ] **Push**: `git push origin <rama>` (o a `main` según el flujo del repo).

## Notas de alcance (no incluidas, por diseño)

- Conciliación automática desde cartola bancaria.
- Pagos parciales / abonos.
- Plazo de vencimiento configurable por cliente.
- Backfill histórico complejo (finanzas se repuebla reimportando 2026).
