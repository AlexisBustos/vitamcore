/**
 * Tipos del Agent Layer (Sprint 3).
 */
import type { Priority } from '@/types/domain';

export type AgentType =
  | 'EXECUTIVE'
  | 'FINANCE'
  | 'SALES'
  | 'PROJECT'
  | 'DOCUMENT'
  | 'STRATEGY'
  | 'GENERAL';

export type AgentMessageRole = 'USER' | 'AGENT' | 'SYSTEM' | 'TOOL';

export type InsightType =
  | 'EXECUTIVE_SUMMARY'
  | 'RISK'
  | 'FINANCIAL'
  | 'SALES'
  | 'PROJECT'
  | 'TASK'
  | 'DECISION'
  | 'DOCUMENT'
  | 'STRATEGY'
  | 'GENERAL';

export type InsightStatus = 'NEW' | 'REVIEWED' | 'DISMISSED' | 'ACTIONED';

export type ProposedTaskStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_TASK';

export type ReportType =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'CONSOLIDATED'
  | 'ORGANIZATION_SPECIFIC'
  | 'CUSTOM';

export interface AgentStatus {
  enabled: boolean;
  provider: string;
  model: string;
  allowWriteActions: boolean;
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  role: AgentMessageRole;
  content: string;
  metadata?: {
    provider?: string;
    toolsUsed?: string[];
    agentType?: AgentType;
  } | null;
  createdAt: string;
}

export interface AgentConversation {
  id: string;
  title: string;
  organizationId: string | null;
  projectId: string | null;
  agentType: AgentType;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: AgentMessage[];
}

export interface ChatResponse {
  conversationId: string;
  message: AgentMessage;
  toolsUsed: string[];
  provider: string;
}

export interface AgentInsight {
  id: string;
  organizationId: string | null;
  projectId: string | null;
  agentType: AgentType;
  type: InsightType;
  title: string;
  summary: string;
  evidence: string | null;
  recommendation: string | null;
  priority: Priority;
  status: InsightStatus;
  /** Presente solo en alertas del motor determinístico (prefijo "alert:"). */
  dedupeKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProposedTask {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  rationale: string | null;
  sourceInsightId: string | null;
  status: ProposedTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutiveReport {
  id: string;
  title: string;
  organizationId: string | null;
  reportType: ReportType;
  periodStart: string | null;
  periodEnd: string | null;
  content: string;
  highlights: string | null;
  risks: string | null;
  recommendations: string | null;
  nextActions: string | null;
  createdAt: string;
  updatedAt: string;
}
