-- AlterTable
ALTER TABLE "expense_records" ADD COLUMN     "paidDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "expense_records_paidDate_idx" ON "expense_records"("paidDate");

-- Resetea gastos marcados pagados por la importación (el pago se registra a mano).
UPDATE "expense_records"
SET "status" = 'PENDING'
WHERE "status" = 'PAID' AND "paidDate" IS NULL;
