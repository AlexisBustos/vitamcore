-- CreateEnum
CREATE TYPE "FinancialImportType" AS ENUM ('SALES_REPORT', 'PURCHASE_REPORT', 'BANK_STATEMENT');

-- CreateEnum
CREATE TYPE "FinancialImportStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "income_records"
  ADD COLUMN "importBatchId" TEXT,
  ADD COLUMN "sourceDocumentType" TEXT,
  ADD COLUMN "sourceFolio" TEXT,
  ADD COLUMN "sourceRut" TEXT,
  ADD COLUMN "sourceIssueDate" TIMESTAMP(3),
  ADD COLUMN "sourceDedupeKey" TEXT,
  ADD COLUMN "rawData" JSONB;

-- AlterTable
ALTER TABLE "expense_records"
  ADD COLUMN "importBatchId" TEXT,
  ADD COLUMN "sourceDocumentType" TEXT,
  ADD COLUMN "sourceFolio" TEXT,
  ADD COLUMN "sourceRut" TEXT,
  ADD COLUMN "sourceIssueDate" TIMESTAMP(3),
  ADD COLUMN "sourceDedupeKey" TEXT,
  ADD COLUMN "rawData" JSONB;

-- CreateTable
CREATE TABLE "bank_accounts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankName" TEXT,
  "accountNumber" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CLP',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_import_batches" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "bankAccountId" TEXT,
  "type" "FinancialImportType" NOT NULL,
  "status" "FinancialImportStatus" NOT NULL DEFAULT 'PREVIEW',
  "periodMonth" TIMESTAMP(3) NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "rowsTotal" INTEGER NOT NULL DEFAULT 0,
  "rowsValid" INTEGER NOT NULL DEFAULT 0,
  "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
  "rowsDuplicated" INTEGER NOT NULL DEFAULT 0,
  "totalIncome" INTEGER NOT NULL DEFAULT 0,
  "totalExpense" INTEGER NOT NULL DEFAULT 0,
  "totalCharges" INTEGER NOT NULL DEFAULT 0,
  "totalCredits" INTEGER NOT NULL DEFAULT 0,
  "warnings" JSONB,
  "previewData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),

  CONSTRAINT "financial_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "channel" TEXT,
  "documentNumber" TEXT,
  "chargeAmount" INTEGER NOT NULL DEFAULT 0,
  "creditAmount" INTEGER NOT NULL DEFAULT 0,
  "balance" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'CLP',
  "rawData" JSONB,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organizationId_accountNumber_key" ON "bank_accounts"("organizationId", "accountNumber");
CREATE INDEX "bank_accounts_organizationId_idx" ON "bank_accounts"("organizationId");
CREATE INDEX "bank_accounts_isActive_idx" ON "bank_accounts"("isActive");

-- CreateIndex
CREATE INDEX "financial_import_batches_organizationId_idx" ON "financial_import_batches"("organizationId");
CREATE INDEX "financial_import_batches_type_idx" ON "financial_import_batches"("type");
CREATE INDEX "financial_import_batches_periodMonth_idx" ON "financial_import_batches"("periodMonth");
CREATE INDEX "financial_import_batches_status_idx" ON "financial_import_batches"("status");
CREATE INDEX "financial_import_batches_sourceHash_idx" ON "financial_import_batches"("sourceHash");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bankAccountId_dedupeKey_key" ON "bank_transactions"("bankAccountId", "dedupeKey");
CREATE INDEX "bank_transactions_organizationId_idx" ON "bank_transactions"("organizationId");
CREATE INDEX "bank_transactions_bankAccountId_idx" ON "bank_transactions"("bankAccountId");
CREATE INDEX "bank_transactions_transactionDate_idx" ON "bank_transactions"("transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "income_records_sourceDedupeKey_key" ON "income_records"("sourceDedupeKey");
CREATE INDEX "income_records_importBatchId_idx" ON "income_records"("importBatchId");
CREATE INDEX "income_records_sourceIssueDate_idx" ON "income_records"("sourceIssueDate");

-- CreateIndex
CREATE UNIQUE INDEX "expense_records_sourceDedupeKey_key" ON "expense_records"("sourceDedupeKey");
CREATE INDEX "expense_records_importBatchId_idx" ON "expense_records"("importBatchId");
CREATE INDEX "expense_records_sourceIssueDate_idx" ON "expense_records"("sourceIssueDate");

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "financial_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "financial_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_import_batches" ADD CONSTRAINT "financial_import_batches_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_import_batches" ADD CONSTRAINT "financial_import_batches_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "financial_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
