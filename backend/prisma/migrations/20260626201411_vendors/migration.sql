-- AlterTable
ALTER TABLE "expense_records" ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_organizationId_idx" ON "vendors"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_organizationId_rut_key" ON "vendors"("organizationId", "rut");

-- CreateIndex
CREATE INDEX "expense_records_vendorId_idx" ON "expense_records"("vendorId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Crear proveedores a partir de gastos ya importados (uno por empresa+RUT).
INSERT INTO "vendors" ("id", "organizationId", "rut", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."organizationId", e."sourceRut",
       COALESCE(MAX(e."vendorName"), e."sourceRut"), now(), now()
FROM "expense_records" e
WHERE e."sourceRut" IS NOT NULL AND e."sourceRut" <> ''
GROUP BY e."organizationId", e."sourceRut"
ON CONFLICT ("organizationId", "rut") DO NOTHING;

-- Enlazar cada gasto con su proveedor.
UPDATE "expense_records" e
SET "vendorId" = v."id"
FROM "vendors" v
WHERE v."organizationId" = e."organizationId"
  AND v."rut" = e."sourceRut"
  AND e."vendorId" IS NULL
  AND e."sourceRut" IS NOT NULL AND e."sourceRut" <> '';
