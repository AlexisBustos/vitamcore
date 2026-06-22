-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('EXECUTIVE', 'FINANCE', 'SALES', 'PROJECT', 'DOCUMENT', 'STRATEGY', 'GENERAL');

-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('EXECUTIVE_SUMMARY', 'RISK', 'FINANCIAL', 'SALES', 'PROJECT', 'TASK', 'DECISION', 'DOCUMENT', 'STRATEGY', 'GENERAL');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('NEW', 'REVIEWED', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "ProposedTaskStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_TASK');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CONSOLIDATED', 'ORGANIZATION_SPECIFIC', 'CUSTOM');

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "agentType" "AgentType" NOT NULL DEFAULT 'EXECUTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_insights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "agentType" "AgentType" NOT NULL DEFAULT 'EXECUTIVE',
    "type" "InsightType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" TEXT,
    "recommendation" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "InsightStatus" NOT NULL DEFAULT 'NEW',
    "sourceData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_proposed_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "rationale" TEXT,
    "sourceInsightId" TEXT,
    "status" "ProposedTaskStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_proposed_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organizationId" TEXT,
    "reportType" "ReportType" NOT NULL DEFAULT 'CUSTOM',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "highlights" TEXT,
    "risks" TEXT,
    "recommendations" TEXT,
    "nextActions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executive_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_conversations_agentType_idx" ON "agent_conversations"("agentType");

-- CreateIndex
CREATE INDEX "agent_messages_conversationId_idx" ON "agent_messages"("conversationId");

-- CreateIndex
CREATE INDEX "agent_insights_status_idx" ON "agent_insights"("status");

-- CreateIndex
CREATE INDEX "agent_insights_agentType_idx" ON "agent_insights"("agentType");

-- CreateIndex
CREATE INDEX "agent_insights_organizationId_idx" ON "agent_insights"("organizationId");

-- CreateIndex
CREATE INDEX "agent_proposed_tasks_status_idx" ON "agent_proposed_tasks"("status");

-- CreateIndex
CREATE INDEX "agent_proposed_tasks_organizationId_idx" ON "agent_proposed_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "executive_reports_reportType_idx" ON "executive_reports"("reportType");

-- CreateIndex
CREATE INDEX "executive_reports_organizationId_idx" ON "executive_reports"("organizationId");

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
