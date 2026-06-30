-- CreateEnum
CREATE TYPE "BankCategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "RuleDirection" AS ENUM ('CHARGE', 'CREDIT', 'ANY');

-- CreateTable
CREATE TABLE "bank_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BankCategoryKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_category_rules" (
    "id" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "matchText" TEXT NOT NULL,
    "direction" "RuleDirection" NOT NULL DEFAULT 'ANY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_categories_key_key" ON "bank_categories"("key");

-- CreateIndex
CREATE INDEX "bank_category_rules_active_priority_idx" ON "bank_category_rules"("active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "bank_category_rules_categoryKey_matchText_direction_key" ON "bank_category_rules"("categoryKey", "matchText", "direction");

-- AddForeignKey
ALTER TABLE "bank_category_rules" ADD CONSTRAINT "bank_category_rules_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "bank_categories"("key") ON DELETE CASCADE ON UPDATE CASCADE;
