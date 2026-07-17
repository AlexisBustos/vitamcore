-- Elimina el módulo de ventas (pipeline comercial): tabla e enums asociados.
-- Los enums SalesStatus/SalesSource solo eran usados por sales_opportunities.

-- DropForeignKey
ALTER TABLE "sales_opportunities" DROP CONSTRAINT IF EXISTS "sales_opportunities_organizationId_fkey";
ALTER TABLE "sales_opportunities" DROP CONSTRAINT IF EXISTS "sales_opportunities_businessUnitId_fkey";
ALTER TABLE "sales_opportunities" DROP CONSTRAINT IF EXISTS "sales_opportunities_projectId_fkey";

-- DropTable
DROP TABLE "sales_opportunities";

-- DropEnum
DROP TYPE "SalesSource";
DROP TYPE "SalesStatus";
