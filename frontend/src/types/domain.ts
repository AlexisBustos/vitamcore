/**
 * Tipos de dominio compartidos por el frontend.
 * Reflejan los modelos y enums del backend (Prisma).
 */

export type {
  OrganizationType, EntityStatus, ProjectStatus, TaskStatus, Priority, TaskSource,
  Ref, Organization, OrganizationDetail, BusinessUnit, Project, ProjectDetail, Task,
  DocumentType, DocumentStatus, DocumentRecord, DecisionStatus, StrategicDecision,
} from './core';
export type { SalesStatus, SalesSource, SalesOpportunity, SalesSummary } from './sales';
export type {
  FinancialImportType, FinancialImportStatus, SalesImportSummary, BankAccount,
  BankTransactionsResponse, BankCategoryBreakdown, BankCategoryKind, RuleDirection,
  BankCategory, BankCategoryRule, BankMonthlyPoint, BankTransaction,
  ReconciliationCandidate, FinancialImportBatch,
} from './banking';
export type {
  IncomeStatus, ExpenseStatus, DocumentKind, RecurrenceFrequency, IncomeRecord,
  ExpenseRecord, ClientStats, Client, ClientDetail, VendorStats, Vendor, VendorDetail,
  FinanceSummary, ReconciliationSummary, ConsolidatedOrg, ConsolidatedResponse,
  AutoReconcilePair, AutoReconcileResult, RecognizeTransfer, RecognizeTransfersResult,
} from './finance';

import type {
  Ref, ProjectStatus, TaskStatus, OrganizationType, Priority, DocumentType,
} from './core';
import type { FinanceSummary } from './finance';
import type { SalesSummary, SalesOpportunity } from './sales';

export interface DashboardSummary {
  totals: {
    activeProjects: number;
    blockedProjects: number;
    pendingTasks: number;
    overdueTasks: number;
    criticalTasks: number;
    monthIncome: number;
    monthExpense: number;
    estimatedResult: number;
    pendingIncome: number;
    pendingExpense: number;
    overdueIncome: number;
    overdueExpense: number;
    openOpportunities: number;
    openAmount: number;
    weightedAmount: number;
    noFollowUpOpportunities: number;
    activeDecisions: number;
    revisitDecisions: number;
  };
  projectsByStatus: Record<ProjectStatus, number>;
  tasksByStatus: Record<TaskStatus, number>;
  projectsByOrganization: {
    id: string;
    name: string;
    type: OrganizationType;
    total: number;
    active: number;
  }[];
  upcomingDueDates: {
    id: string;
    title: string;
    dueDate: string;
    priority: Priority;
    organization: Ref;
    project: Ref | null;
  }[];
  finance: FinanceSummary;
  sales: SalesSummary;
  recentDocuments: {
    id: string;
    title: string;
    documentType: DocumentType;
    createdAt: string;
    organization: Ref;
  }[];
  upcomingFollowUps: SalesOpportunity[];
}
