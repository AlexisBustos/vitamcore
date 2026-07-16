-- Fase 2: el lote declara su período como rango [periodStart, periodEnd] en vez
-- del mes-etiqueta periodMonth. Ver spec §3.
--
-- Orden deliberado: las columnas nuevas nacen NULLABLE, se backfillean desde
-- periodMonth, y solo entonces se ponen NOT NULL. Crear una columna NOT NULL sin
-- default sobre una tabla con filas fallaría.

-- 1. Columnas nuevas, nullable de momento.
ALTER TABLE "financial_import_batches"
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd"   TIMESTAMP(3),
  ADD COLUMN "dataStart"   TIMESTAMP(3),
  ADD COLUMN "dataEnd"     TIMESTAMP(3);

-- 2. Backfill: periodStart = primer día del mes declarado; periodEnd = último día.
--    dataStart/dataEnd quedan NULL: no se reconstruyen sin reparsear los archivos,
--    y NULL dice la verdad ("no lo sé") en vez de inventar un rango.
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
--    confirmar un lote SIN periodStart/periodEnd. Es material desechable (no hay
--    filas suyas en la BD); se cierra. Ver spec §2c. FAILED ya existe en el enum.
UPDATE "financial_import_batches" SET status = 'FAILED' WHERE status = 'PREVIEW';
