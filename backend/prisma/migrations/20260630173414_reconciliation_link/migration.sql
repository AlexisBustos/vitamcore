-- AlterTable
ALTER TABLE "expense_records" ADD COLUMN     "paidByBankTransactionId" TEXT;

-- AlterTable
ALTER TABLE "income_records" ADD COLUMN     "paidByBankTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "expense_records_paidByBankTransactionId_idx" ON "expense_records"("paidByBankTransactionId");

-- CreateIndex
CREATE INDEX "income_records_paidByBankTransactionId_idx" ON "income_records"("paidByBankTransactionId");

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_paidByBankTransactionId_fkey" FOREIGN KEY ("paidByBankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_paidByBankTransactionId_fkey" FOREIGN KEY ("paidByBankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
