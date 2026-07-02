/**
 * Tipos de dominio: ventas (oportunidades comerciales y su resumen).
 */

import type { ContextRefs } from './core';

// ---- Sprint 2 ----

export type SalesStatus =
  | 'LEAD'
  | 'CONTACTED'
  | 'MEETING_SCHEDULED'
  | 'DIAGNOSIS_DONE'
  | 'PROPOSAL_SENT'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'
  | 'PAUSED';
export type SalesSource =
  | 'MANUAL'
  | 'REFERRAL'
  | 'EMAIL'
  | 'MEETING'
  | 'WEBSITE'
  | 'LINKEDIN'
  | 'EXISTING_CLIENT'
  | 'OTHER';

export interface SalesOpportunity extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  clientName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  opportunityName: string;
  productOrService: string | null;
  estimatedAmount: number;
  currency: string;
  probability: number;
  status: SalesStatus;
  expectedCloseDate: string | null;
  nextAction: string | null;
  nextFollowUpDate: string | null;
  source: SalesSource;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesSummary {
  openCount: number;
  wonCount: number;
  lostCount: number;
  openAmount: number;
  weightedAmount: number;
  noFollowUpCount: number;
  byStatus: Record<string, number>;
  upcomingFollowUps: SalesOpportunity[];
}
