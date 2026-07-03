-- 1. Expand: añadir ownerId (nullable) manteniendo owner
ALTER TABLE "tasks" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "projects" ADD COLUMN "ownerId" TEXT;

-- 2. Migrar datos: match por nombre normalizado contra usuarios ACTIVOS,
--    solo cuando el match es único (evita asignaciones arbitrarias).
UPDATE "tasks" t
SET "ownerId" = u.id
FROM "users" u
WHERE u."isActive" = true
  AND t."owner" IS NOT NULL AND btrim(t."owner") <> ''
  AND lower(btrim(u.name)) = lower(btrim(t."owner"))
  AND (
    SELECT count(*) FROM "users" u2
    WHERE u2."isActive" = true
      AND lower(btrim(u2.name)) = lower(btrim(t."owner"))
  ) = 1;

UPDATE "projects" p
SET "ownerId" = u.id
FROM "users" u
WHERE u."isActive" = true
  AND p."owner" IS NOT NULL AND btrim(p."owner") <> ''
  AND lower(btrim(u.name)) = lower(btrim(p."owner"))
  AND (
    SELECT count(*) FROM "users" u2
    WHERE u2."isActive" = true
      AND lower(btrim(u2.name)) = lower(btrim(p."owner"))
  ) = 1;

-- 3. Preservar los no matcheados en notes (sin pisar notes existente)
UPDATE "tasks"
SET "notes" = CASE
    WHEN "notes" IS NULL OR btrim("notes") = ''
      THEN 'Responsable previo (sin cuenta): ' || "owner"
    ELSE 'Responsable previo (sin cuenta): ' || "owner" || E'\n' || "notes"
  END
WHERE "ownerId" IS NULL AND "owner" IS NOT NULL AND btrim("owner") <> '';

UPDATE "projects"
SET "notes" = CASE
    WHEN "notes" IS NULL OR btrim("notes") = ''
      THEN 'Responsable previo (sin cuenta): ' || "owner"
    ELSE 'Responsable previo (sin cuenta): ' || "owner" || E'\n' || "notes"
  END
WHERE "ownerId" IS NULL AND "owner" IS NOT NULL AND btrim("owner") <> '';

-- 4. Contract: eliminar la columna de texto
ALTER TABLE "tasks" DROP COLUMN "owner";
ALTER TABLE "projects" DROP COLUMN "owner";

-- 5. Índices y claves foráneas
CREATE INDEX "tasks_ownerId_idx" ON "tasks"("ownerId");
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
