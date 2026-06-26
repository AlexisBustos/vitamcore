-- Corrige facturas marcadas como pagadas sin fecha de cobro (dato legacy de
-- importaciones previas al rediseño de cobranza). El cobro se registra a mano.
UPDATE "income_records"
SET "status" = 'INVOICED'
WHERE "status" = 'PAID' AND "paidDate" IS NULL;
