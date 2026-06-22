-- Reducción de TaskStatus de 6 a 3 valores preservando las tareas existentes.
-- Mapeo: PENDING→TODO; IN_PROGRESS/BLOCKED/IN_REVIEW→DOING; COMPLETED/CANCELLED→DONE.

-- 1. Nuevo enum
CREATE TYPE "TaskStatus_new" AS ENUM ('TODO', 'DOING', 'DONE');

-- 2. Quitar el default para poder alterar el tipo de la columna
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;

-- 3. Convertir la columna remapeando los valores antiguos
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "TaskStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING'     THEN 'TODO'
      WHEN 'IN_PROGRESS' THEN 'DOING'
      WHEN 'BLOCKED'     THEN 'DOING'
      WHEN 'IN_REVIEW'   THEN 'DOING'
      WHEN 'COMPLETED'   THEN 'DONE'
      WHEN 'CANCELLED'   THEN 'DONE'
    END
  )::"TaskStatus_new";

-- 4. Intercambiar el tipo viejo por el nuevo
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE "TaskStatus_old";

-- 5. Restaurar el default con el nuevo valor
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'TODO';
