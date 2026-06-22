-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('LEAD', 'CONTACTED', 'MEETING_SCHEDULED', 'DIAGNOSIS_DONE', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'PAUSED');

-- CreateEnum
CREATE TYPE "SalesSource" AS ENUM ('MANUAL', 'REFERRAL', 'EMAIL', 'MEETING', 'WEBSITE', 'LINKEDIN', 'EXISTING_CLIENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IncomeStatus" AS ENUM ('EXPECTED', 'INVOICED', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'PROPOSAL', 'QUOTE', 'REPORT', 'MEETING_MINUTES', 'FINANCIAL', 'TECHNICAL', 'LEGAL', 'NORMATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DRAFT', 'REVIEW', 'FINAL');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'IMPLEMENTED', 'REVISIT', 'CANCELLED');

-- CreateTable
CREATE TABLE "sales_opportunities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "projectId" TEXT,
    "clientName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "opportunityName" TEXT NOT NULL,
    "productOrService" TEXT,
    "estimatedAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "status" "SalesStatus" NOT NULL DEFAULT 'LEAD',
    "expectedCloseDate" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextFollowUpDate" TIMESTAMP(3),
    "source" "SalesSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "projectId" TEXT,
    "clientName" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "category" TEXT,
    "status" "IncomeStatus" NOT NULL DEFAULT 'EXPECTED',
    "incomeDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceFrequency" "RecurrenceFrequency",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "projectId" TEXT,
    "vendorName" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "category" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "expenseDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceFrequency" "RecurrenceFrequency",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "documentType" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientName" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiSummary" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategic_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "decision" TEXT NOT NULL,
    "rationale" TEXT,
    "risks" TEXT,
    "nextStep" TEXT,
    "decisionDate" TIMESTAMP(3),
    "status" "DecisionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategic_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_opportunities_organizationId_idx" ON "sales_opportunities"("organizationId");

-- CreateIndex
CREATE INDEX "sales_opportunities_status_idx" ON "sales_opportunities"("status");

-- CreateIndex
CREATE INDEX "sales_opportunities_nextFollowUpDate_idx" ON "sales_opportunities"("nextFollowUpDate");

-- CreateIndex
CREATE INDEX "income_records_organizationId_idx" ON "income_records"("organizationId");

-- CreateIndex
CREATE INDEX "income_records_status_idx" ON "income_records"("status");

-- CreateIndex
CREATE INDEX "income_records_incomeDate_idx" ON "income_records"("incomeDate");

-- CreateIndex
CREATE INDEX "income_records_dueDate_idx" ON "income_records"("dueDate");

-- CreateIndex
CREATE INDEX "expense_records_organizationId_idx" ON "expense_records"("organizationId");

-- CreateIndex
CREATE INDEX "expense_records_status_idx" ON "expense_records"("status");

-- CreateIndex
CREATE INDEX "expense_records_expenseDate_idx" ON "expense_records"("expenseDate");

-- CreateIndex
CREATE INDEX "expense_records_dueDate_idx" ON "expense_records"("dueDate");

-- CreateIndex
CREATE INDEX "documents_organizationId_idx" ON "documents"("organizationId");

-- CreateIndex
CREATE INDEX "documents_documentType_idx" ON "documents"("documentType");

-- CreateIndex
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");

-- CreateIndex
CREATE INDEX "strategic_decisions_organizationId_idx" ON "strategic_decisions"("organizationId");

-- CreateIndex
CREATE INDEX "strategic_decisions_status_idx" ON "strategic_decisions"("status");

-- CreateIndex
CREATE INDEX "strategic_decisions_decisionDate_idx" ON "strategic_decisions"("decisionDate");

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_decisions" ADD CONSTRAINT "strategic_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_decisions" ADD CONSTRAINT "strategic_decisions_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_decisions" ADD CONSTRAINT "strategic_decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
