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

import type {
  ContextRefs, Ref, ProjectStatus, TaskStatus, OrganizationType, Priority, DocumentType,
} from './core';
import type { SalesSummary, SalesOpportunity } from './sales';

// ---- Sprint 2 ----

export type IncomeStatus =
  | 'EXPECTED'
  | 'INVOICED'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';
export type ExpenseStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type DocumentKind = 'SALE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type RecurrenceFrequency =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY';

export interface IncomeRecord extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  clientId: string | null;
  documentKind: DocumentKind;
  clientName: string | null;
  description: string;
  amount: number;
  currency: string;
  category: string | null;
  status: IncomeStatus;
  incomeDate: string | null;
  dueDate: string | null;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
  notes: string | null;
  netAmount: number | null;
  paidDate: string | null;
  paidByBankTransactionId: string | null;
  creditsIncomeId: string | null;
  sourceFolio: string | null;
  sourceIssueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  vendorName: string | null;
  description: string;
  amount: number;
  currency: string;
  category: string | null;
  status: ExpenseStatus;
  vendorId: string | null;
  paidDate: string | null;
  paidByBankTransactionId: string | null;
  sourceFolio: string | null;
  sourceIssueDate: string | null;
  expenseDate: string | null;
  dueDate: string | null;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientStats {
  netSales: number;
  grossInvoiced: number;
  totalCreditNotes: number;
  invoiceCount: number;
  creditNoteCount: number;
  collectedAmount: number;
  pendingAmount: number;
  documentCount: number;
  lastDocumentDate: string | null;
}

export interface Client {
  id: string;
  organizationId: string;
  rut: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  stats: ClientStats;
}

export interface ClientDetail extends Client {
  incomes: IncomeRecord[];
}

export interface VendorStats {
  totalSpent: number;
  paidAmount: number;
  pendingAmount: number;
  documentCount: number;
  lastDocumentDate: string | null;
}

export interface Vendor {
  id: string;
  organizationId: string;
  rut: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  stats: VendorStats;
}

export interface VendorDetail extends Vendor {
  expenses: ExpenseRecord[];
}

export interface FinanceSummary {
  monthIncome: number;
  monthExpense: number;
  estimatedResult: number;
  pendingIncome: number;
  collectedIncome: number;
  pendingExpense: number;
  recurringIncome: number;
  recurringExpense: number;
  overdueIncome: { count: number; amount: number };
  overdueExpense: { count: number; amount: number };
  incomeByCategory: { category: string; amount: number }[];
  expenseByCategory: { category: string; amount: number }[];
  byOrganization: {
    id: string;
    name: string;
    income: number;
    expense: number;
    result: number;
  }[];
  upcomingFinancial: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    dueDate: string | null;
    status: string;
    organization: Ref;
    kind: 'INCOME' | 'EXPENSE';
  }[];
}

export interface ReconciliationSummary {
  credits: { total: number; conciliado: number; suelto: number };
  charges: { total: number; conciliado: number; suelto: number };
  unlinkedCount: number;
  internal: { count: number; amount: number };
}

export interface ConsolidatedOrg {
  organizationId: string;
  name: string;
  cash: number;
  receivable: number;
  payable: number;
  position: number;
}

export interface ConsolidatedResponse {
  cash: number;
  receivable: number;
  payable: number;
  position: number;
  overdueReceivable: { amount: number; count: number };
  overduePayable: { amount: number; count: number };
  byOrganization: ConsolidatedOrg[];
  reconciliation: ReconciliationSummary;
}

export interface AutoReconcilePair {
  kind: 'income' | 'expense';
  invoiceId: string;
  movId: string;
  amount: number;
  counterpart: string;
  document: string;
  invoiceDate: string | null;
  movementDescription: string;
  movementDocumentNumber: string | null;
  movementDate: string;
}

export interface AutoReconcileResult {
  pairs: number;
  linkedIncome: number;
  linkedExpense: number;
  ambiguousAmounts: number;
  details: AutoReconcilePair[];
}

export interface RecognizeTransfer {
  movId: string;
  payee: string;
  amount: number;
  date: string;
  description: string;
}

export interface RecognizeTransfersResult {
  count: number;
  created: number;
  totalAmount: number;
  details: RecognizeTransfer[];
}

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
