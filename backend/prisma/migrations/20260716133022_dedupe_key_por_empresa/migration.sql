-- Prefija las dedupeKey existentes con la empresa. Ver spec §2.
--
-- No puede violar el unique POR CONSTRUCCIÓN: los cuid no contienen '|', así
-- que orgA|K1 = orgB|K2 exige orgA=orgB y K1=K2, que es justo lo que el unique
-- global ya impedía. Y los espacios de claves viejo (SALES_REPORT|…) y nuevo
-- (<cuid>|…) son disjuntos, así que tampoco hay colisión transitoria durante
-- el UPDATE.
--
-- El guardia NOT LIKE la hace re-ejecutable: las claves viejas empiezan siempre
-- por SALES_REPORT|/PURCHASE_REPORT|, nunca por un cuid, y los cuid no llevan
-- los comodines % ni _ de LIKE, así que la comparación es literal.

UPDATE income_records
   SET "sourceDedupeKey" = "organizationId" || '|' || "sourceDedupeKey"
 WHERE "sourceDedupeKey" IS NOT NULL
   AND "sourceDedupeKey" NOT LIKE "organizationId" || '|%';

UPDATE expense_records
   SET "sourceDedupeKey" = "organizationId" || '|' || "sourceDedupeKey"
 WHERE "sourceDedupeKey" IS NOT NULL
   AND "sourceDedupeKey" NOT LIKE "organizationId" || '|%';

-- Lotes colgados en PREVIEW: confirmImport reproduce las dedupeKey congeladas
-- en previewData, así que un lote previo al despliegue insertaría claves SIN
-- prefijo que el backfill ya no alcanza — invisibles para siempre a la dedup.
-- Un PREVIEW es un archivo subido y no confirmado: no hay ninguna fila suya en
-- la BD y volver a subirlo cuesta diez segundos.
UPDATE financial_import_batches SET status = 'FAILED' WHERE status = 'PREVIEW';
