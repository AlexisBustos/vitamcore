-- Añade dedupeKey a agent_insights para la idempotencia del motor de alertas
-- determinístico. Nullable y no único (permite re-alertar tras un DISMISSED).

-- AlterTable
ALTER TABLE "agent_insights" ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE INDEX "agent_insights_dedupeKey_idx" ON "agent_insights"("dedupeKey");
