-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskActivityType" ADD VALUE 'ASSIGNEE_ADDED';
ALTER TYPE "TaskActivityType" ADD VALUE 'ASSIGNEE_REMOVED';

-- CreateTable
CREATE TABLE "task_assignees" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copiar responsables existentes ANTES de borrar la columna (sin pérdida de datos)
INSERT INTO "task_assignees" ("taskId", "userId")
SELECT "id", "ownerId" FROM "tasks" WHERE "ownerId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_ownerId_fkey";

-- DropIndex
DROP INDEX "tasks_ownerId_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "ownerId";
