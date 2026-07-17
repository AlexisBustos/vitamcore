import type { AgentType } from '@prisma/client';

/** Intención de una acción rápida (las usa el proveedor heurístico). */
export type QuickIntent =
  | 'executive-summary'
  | 'healthcare-summary'
  | 'tech-summary'
  | 'financial-analysis'
  | 'project-risks'
  | 'weekly-plan'
  | 'documents-recent';

export interface AgentRunInput {
  agentType: AgentType;
  message: string;
  organizationId?: string | null;
  projectId?: string | null;
  allowWrite: boolean;
  /** Para acciones rápidas; en chat libre va undefined. */
  intent?: QuickIntent;
  history?: { role: 'USER' | 'AGENT'; content: string }[];
}

export interface AgentRunResult {
  content: string;
  toolsUsed: string[];
  provider: string;
}

export interface AgentProvider {
  readonly name: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
