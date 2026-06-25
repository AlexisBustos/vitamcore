-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('SALE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- AlterTable
ALTER TABLE "income_records" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "documentKind" "DocumentKind" NOT NULL DEFAULT 'SALE';

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_organizationId_idx" ON "clients"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organizationId_rut_key" ON "clients"("organizationId", "rut");

-- CreateIndex
CREATE INDEX "income_records_clientId_idx" ON "income_records"("clientId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
