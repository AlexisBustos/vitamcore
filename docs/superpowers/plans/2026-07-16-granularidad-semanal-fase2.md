# Granularidad semanal en Finanzas — Fase 2 — Plan de implementación

**Goal:** Que el lote de importación **declare su período como un rango desde/hasta** en vez de un mes-etiqueta, con selectores de fecha y atajos de semana en el frontend. Al terminar, el CEO puede **subir por semana** (ventas, compras, cartolas), aunque el análisis siga siendo mensual (eso es la Fase 3).

**Spec:** `docs/superpowers/specs/2026-07-16-finanzas-granularidad-semanal-design.md` §3 (El lote con rango explícito) y §2c (lotes PREVIEW colgados). **Léelo antes de empezar.**

**Arquitectura:** `FinancialImportBatch.periodMonth` (un `DateTime`) se sustituye por `periodStart`/`periodEnd` (rango declarado inclusivo) + `dataStart`/`dataEnd` (min/max real de las filas, nullable). El preview gana tres advertencias no bloqueantes. El frontend cambia `<Input type="month">` por dos `<Input type="date">` con atajos "Esta semana"/"Semana pasada".

**Tech Stack:** Express + Prisma (PostgreSQL), Zod, Vitest (BD real), React + Vite + TanStack Query, TypeScript strict.

**Convenciones del repo:** todo en español; identificadores técnicos en inglés; services lanzan con helpers de `utils/http-error.ts`; fechas del dominio son de **calendario a medianoche UTC**; SQL crudo con whitelist tipada. Verificación backend `npm test`+`npm run build` desde `backend/`; frontend `npm run lint` desde `frontend/`.

**Diferencia clave con la Fase 0:** esta fase **sí cambia comportamiento y contrato**, así que **sí** se modifican tests existentes (los que arman lotes con `periodMonth`). Eso es esperado aquí.

**Estado de partida:** rama `develop`, limpia, 237 tests verdes. Fases 0 y 1 ya en `main` + VPS.

---

## Chunk 1: Esquema y migración

### Task 1: Cambiar el modelo `FinancialImportBatch`

**Files:** `backend/prisma/schema.prisma`

- [ ] **Step 1:** En `model FinancialImportBatch`, sustituye `periodMonth DateTime` por:
```prisma
  periodStart      DateTime
  periodEnd        DateTime
  dataStart        DateTime?
  dataEnd          DateTime?
```
- [ ] **Step 2:** Sustituye `@@index([periodMonth])` por `@@index([periodStart, periodEnd])`.
- [ ] **Step 3:** NO corras `migrate dev` todavía (la migración se escribe a mano en la Task 2 para controlar el backfill). Solo deja el schema editado.

### Task 2: La migración con backfill

**Files:** `backend/prisma/migrations/<ts>_lote_rango_declarado/migration.sql`

- [ ] **Step 1:** Genera el esqueleto: `cd backend && npx prisma migrate dev --create-only --name lote_rango_declarado`.
- [ ] **Step 2:** Reescribe el SQL para que **añada** las columnas nullable, **backfillee**, y solo entonces ponga `periodStart`/`periodEnd` como `NOT NULL` y borre `periodMonth`. Orden importa (no se puede crear `NOT NULL` sin default sobre una tabla con filas):
```sql
-- 1. Columnas nuevas, nullable de momento.
ALTER TABLE "financial_import_batches"
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd"   TIMESTAMP(3),
  ADD COLUMN "dataStart"   TIMESTAMP(3),
  ADD COLUMN "dataEnd"     TIMESTAMP(3);

-- 2. Backfill: periodStart = primer día del mes declarado; periodEnd = último día.
--    dataStart/dataEnd quedan NULL: no se pueden reconstruir sin reparsear los
--    archivos, y NULL dice la verdad ("no lo sé") en vez de inventar un rango.
UPDATE "financial_import_batches"
   SET "periodStart" = date_trunc('month', "periodMonth"),
       "periodEnd"   = (date_trunc('month', "periodMonth") + INTERVAL '1 month' - INTERVAL '1 day');

-- 3. Ahora sí, obligatorias.
ALTER TABLE "financial_import_batches"
  ALTER COLUMN "periodStart" SET NOT NULL,
  ALTER COLUMN "periodEnd"   SET NOT NULL;

-- 4. Fuera el mes-etiqueta y su índice; entra el índice del rango.
DROP INDEX IF EXISTS "financial_import_batches_periodMonth_idx";
ALTER TABLE "financial_import_batches" DROP COLUMN "periodMonth";
CREATE INDEX "financial_import_batches_periodStart_periodEnd_idx"
  ON "financial_import_batches" ("periodStart", "periodEnd");

-- 5. Lotes PREVIEW colgados: un preview previo al despliegue reproduciría al
--    confirmar un lote SIN periodStart/periodEnd. Es material desechable (nada en
--    BD); se cierra. Ver spec §2c. FAILED ya existe en el enum.
UPDATE "financial_import_batches" SET status = 'FAILED' WHERE status = 'PREVIEW';
```
- [ ] **Step 3:** Aplica en local: `npx prisma migrate dev`. Verifica que compila el cliente.
- [ ] **Step 4:** `npm run prisma:generate` si hiciera falta (migrate dev ya regenera).

---

## Chunk 2: Backend

### Task 3: `requiredDateInput` en `shared/zod.ts`

**Files:** `backend/src/modules/shared/zod.ts`

- [ ] **Step 1:** Añade, junto a `dateInput`:
```ts
// Como dateInput pero OBLIGATORIO: rango de lote no puede faltar (spec §3, Decisión 3).
export const requiredDateInput = z.coerce.date({
  required_error: 'La fecha es obligatoria',
  invalid_type_error: 'La fecha no es válida',
});
```

### Task 4: `previewImportSchema` con rango

**Files:** `backend/src/modules/finance-imports/finance-imports.schema.ts`
**Test:** `backend/test/finance-imports.schema` (si no existe, se prueba vía el service)

- [ ] **Step 1:** Importa `requiredDateInput` y sustituye `periodMonth` por:
```ts
export const previewImportSchema = z
  .object({
    organizationId: z.string().min(1, 'La empresa es obligatoria'),
    bankAccountId: z.string().min(1).optional().nullable(),
    type: importTypeEnum,
    periodStart: requiredDateInput,
    periodEnd: requiredDateInput,
  })
  .refine((d) => d.periodStart <= d.periodEnd, {
    message: 'El período "desde" no puede ser posterior al "hasta"',
    path: ['periodEnd'],
  });
```

### Task 5: Helper de semana ISO en `period.ts`

**Files:** `backend/src/modules/shared/period.ts` · **Test:** `backend/test/period.test.ts`

- [ ] **Step 1 (test primero):** Añade tests: un rango [lun 6 jul, dom 12 jul] 2026 **es** semana completa; [lun 6, sáb 11] no; [mar 7, lun 13] no.
- [ ] **Step 2:** Implementa:
```ts
/** ¿El rango inclusivo [start, end] es exactamente una semana ISO (lun–dom)? */
export function isFullIsoWeek(start: Date, end: Date): boolean {
  const k = periodKey('week', start);
  const { gte, lt } = periodRange('week', k);
  const endExclusive = new Date(end.getTime() + DIA_MS);
  return start.getTime() === gte.getTime() && endExclusive.getTime() === lt.getTime();
}
```

### Task 6: `previewImport` — rango, dataStart/dataEnd y tres advertencias

**Files:** `backend/src/modules/finance-imports/import-pipeline.service.ts`
**Test:** `backend/test/finance-imports.service.test.ts`

- [ ] **Step 1:** Borra `normalizePeriodMonth` (`:451`). Deriva `dataStart`/`dataEnd` del min/max de las fechas de las filas parseadas (`row.data.incomeDate ?? expenseDate ?? transactionDate`), ignorando `ERROR` y nulos.
- [ ] **Step 2:** Calcula las tres advertencias de lote (spec §3), no bloqueantes:
  - **(a) filas fuera de rango:** si `dataStart < periodStart` o `dataEnd > periodEnd` → *"Declaraste {periodStart}–{periodEnd}, pero hay N filas fuera de ese rango"*.
  - **(b) archivo repetido:** `sourceHash` ya existe en un lote `CONFIRMED` (query nueva; hoy `sourceHash` se guarda y nunca se consulta) → *"Este archivo ya se importó el {fecha}"*.
  - **(c) no es semana completa:** `!isFullIsoWeek(periodStart, periodEnd)` → *"El rango no cubre una semana completa (lun–dom)"*.
- [ ] **Step 3:** Persiste `periodStart`, `periodEnd`, `dataStart`, `dataEnd` en el `create`, y **antepón** las advertencias de lote al array `warnings` (además de las de fila). Devuélvelas también en la respuesta para que el frontend las muestre destacadas (p. ej. `batchWarnings: string[]` en el objeto de retorno).
- [ ] **Step 4:** Ajusta `getBatch`/`listBatches` si seleccionan `periodMonth` (no lo hacen explícitamente; usan `include: refs`). Verifica el typecheck.

### Task 7: Arreglar tests y fixtures que usan `periodMonth`

**Files:** `backend/test/fixtures.ts`, `backend/test/finance-imports.service.test.ts`, `backend/test/period.test.ts` (helper `movimientosDe` usa `makeImportBatch`)

- [ ] **Step 1:** En `fixtures.ts:makeImportBatch`, sustituye `periodMonth: new Date('2026-07-01')` por `periodStart: new Date('2026-07-01'), periodEnd: new Date('2026-07-31')`.
- [ ] **Step 2:** En `finance-imports.service.test.ts`, cada `financialImportBatch.create({...})` inline que ponga `periodMonth` pasa a `periodStart`/`periodEnd`. (Son varios; el typecheck los caza todos con `npm run build`.)
- [ ] **Step 3:** `npm test && npm run build` verde.

---

## Chunk 3: Frontend

### Task 8: Tipos y hook de preview

**Files:** `frontend/src/types/banking.ts`, `frontend/src/hooks/useBankImports.ts`

- [ ] **Step 1:** En `types/banking.ts`, el tipo del lote: `periodMonth: string` → `periodStart: string; periodEnd: string; dataStart: string | null; dataEnd: string | null;`.
- [ ] **Step 2:** En `useBankImports.ts`, el input del preview (`:29`): `periodMonth` → `periodStart` + `periodEnd`. En el `FormData` (`:171`), `append('periodStart', …)` y `append('periodEnd', …)`.

### Task 9: `FinanceImportsTab` — selectores de fecha y atajos

**Files:** `frontend/src/pages/finance/FinanceImportsTab.tsx`

- [ ] **Step 1:** Estado: `periodMonth` → `periodStart`/`periodEnd` (strings `YYYY-MM-DD`). Default: la semana en curso (lunes–domingo) en horario de Chile.
- [ ] **Step 2:** El campo "Período" (`:134`) pasa a dos `<Input type="date">` (Desde / Hasta) + dos botones **"Esta semana"** / **"Semana pasada"** que rellenan lunes–domingo de un clic. Añade un pequeño helper local `semanaISO(offset)` que devuelve `{ desde, hasta }` (lunes y domingo) resolviendo "hoy" en `America/Santiago` — el backend no puede compartir código, así que es una copia mínima local.
- [ ] **Step 3:** `handlePreview` manda `periodStart`/`periodEnd` en vez de `periodMonth: \`${periodMonth}-01\``. `canPreview` exige ambas fechas.
- [ ] **Step 4:** El panel de preview muestra las **advertencias de lote** (`batchWarnings`) destacadas arriba (amarillo), separadas de las advertencias por fila.
- [ ] **Step 5:** La tabla de historial (`:299`, `:309`): la columna "Período" muestra el rango `formatDate(periodStart) – formatDate(periodEnd)` en vez de `periodMonth`.
- [ ] **Step 6:** Los textos "mensual" de la UI (`:117`, `:129`) se ajustan ("Nueva importación", "cargar reportes y cartolas").
- [ ] **Step 7:** `cd frontend && npm run lint` limpio.

---

## Chunk 4: Verificación y cierre

### Task 10: Suite + verificación end-to-end

- [ ] **Step 1:** `cd backend && npm test && npm run build`; `cd frontend && npm run lint`. Todo verde.
- [ ] **Step 2:** `/verify`: levantar la app, subir un reporte de ventas declarando una **semana** (con el atajo), comprobar que: el lote guarda el rango; si el archivo trae filas fuera de la semana, salta la advertencia (a); resubir el mismo archivo dispara la (b); confirmar funciona.
- [ ] **Step 3:** Commits por task. NO desplegar a producción sin visto bueno explícito del CEO (la migración borra `periodMonth` y cierra lotes PREVIEW; es irreversible sobre finanzas reales).

### Task 11: Deploy a producción (con aprobación)

- [ ] `pg_dump` de prod → merge `develop`→`main` → `deploy.sh` → verificar migración (`\d financial_import_batches`), health, y que el historial muestra rangos. Volver a `develop`.
