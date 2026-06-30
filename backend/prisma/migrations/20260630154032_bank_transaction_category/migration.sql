-- AlterTable
ALTER TABLE "bank_transactions" ADD COLUMN     "category" TEXT,
ADD COLUMN     "categoryManual" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "bank_transactions_category_idx" ON "bank_transactions"("category");
