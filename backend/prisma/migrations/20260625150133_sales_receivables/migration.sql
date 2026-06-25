-- AlterTable
ALTER TABLE "income_records" ADD COLUMN     "creditsIncomeId" TEXT,
ADD COLUMN     "netAmount" INTEGER,
ADD COLUMN     "paidDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "income_records_creditsIncomeId_idx" ON "income_records"("creditsIncomeId");

-- CreateIndex
CREATE INDEX "income_records_paidDate_idx" ON "income_records"("paidDate");

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_creditsIncomeId_fkey" FOREIGN KEY ("creditsIncomeId") REFERENCES "income_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
