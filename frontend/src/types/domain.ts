/**
 * Tipos de dominio compartidos por el frontend.
 * Reflejan los modelos y enums del backend (Prisma).
 */

export type OrganizationType = 'HEALTHCARE' | 'TECHNOLOGY' | 'TRANSVERSAL';
export type EntityStatus = 'ACTIVE' | 'INACTIVE';
export type ProjectStatus =
  | 'IDEA'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'PAUSED'
  | 'CANCELLED';
export type TaskStatus = 'TODO' | 'DOING' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskSource =
  | 'MANUAL'
  | 'MEETING'
  | 'EMAIL'
  | 'DOCUMENT'
  | 'AI'
  | 'OTHER';

export interface Ref {
  id: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  type: OrganizationType;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { businessUnits: number; projects: number; tasks: number };
}

export interface OrganizationDetail extends Organization {
  businessUnits: (BusinessUnit & { _count?: { projects: number } })[];
  projects: Project[];
}

export interface BusinessUnit {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: string | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  _count?: { projects: number; tasks: number };
}

export interface Project {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  targetDate: string | null;
  owner: string | null;
  nextAction: string | null;
  risks: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  businessUnit?: Ref | null;
  _count?: { tasks: number };
  taskStats?: { total: number; done: number }; // avance según tareas (solo en listado)
}

export interface ProjectDetail extends Project {
  tasks: Task[];
}

export interface Task {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  owner: string | null;
  source: TaskSource;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  businessUnit?: Ref | null;
  project?: Ref | null;
}

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
export type FinancialImportType =
  | 'SALES_REPORT'
  | 'PURCHASE_REPORT'
  | 'BANK_STATEMENT';
export type FinancialImportStatus = 'PREVIEW' | 'CONFIRMED' | 'FAILED';
export type DocumentType =
  | 'CONTRACT'
  | 'PROPOSAL'
  | 'QUOTE'
  | 'REPORT'
  | 'MEETING_MINUTES'
  | 'FINANCIAL'
  | 'TECHNICAL'
  | 'LEGAL'
  | 'NORMATIVE'
  | 'OTHER';
export type DocumentStatus =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'DRAFT'
  | 'REVIEW'
  | 'FINAL';
export type DecisionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'IMPLEMENTED'
  | 'REVISIT'
  | 'CANCELLED';

interface ContextRefs {
  organization?: Ref;
  businessUnit?: Ref | null;
  project?: Ref | null;
}

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

/// Resumen específico de una importación de ventas (separación factura/NC).
export interface SalesImportSummary {
  totalGross: number;
  totalCreditNotes: number;
  totalNet: number;
  clientsNew: number;
  clientsExisting: number;
}

export interface BankAccount {
  id: string;
  organizationId: string;
  name: string;
  bankName: string | null;
  accountNumber: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  // Derivados del último movimiento de la cartola (listBankAccounts).
  currentBalance?: number | null;
  lastMovementDate?: string | null;
  movementCount?: number;
}

export interface BankTransactionsResponse {
  transactions: BankTransaction[];
  totals: {
    count: number;
    charges: number;
    credits: number;
    net: number;
    endingBalance: number | null;
    startingBalance: number | null;
  };
}

export interface BankCategoryBreakdown {
  category: string | null;
  credits: number;
  charges: number;
  count: number;
}

export interface BankMonthlyPoint {
  month: string; // 'YYYY-MM'
  closingBalance: number;
  netFlow: number; // abonos − cargos
  credits: number; // abonos
  charges: number; // cargos
}

export interface BankTransaction {
  id: string;
  organizationId: string;
  bankAccountId: string;
  importBatchId: string;
  transactionDate: string;
  description: string;
  channel: string | null;
  documentNumber: string | null;
  chargeAmount: number;
  creditAmount: number;
  balance: number | null;
  currency: string;
  category: string | null;
  categoryManual: boolean;
  createdAt: string;
  organization?: Ref;
  bankAccount?: Pick<BankAccount, 'id' | 'name' | 'accountNumber'>;
}

export interface FinancialImportBatch {
  id: string;
  organizationId: string;
  bankAccountId: string | null;
  type: FinancialImportType;
  status: FinancialImportStatus;
  periodMonth: string;
  originalFileName: string;
  fileSize: number;
  sourceHash: string;
  rowsTotal: number;
  rowsValid: number;
  rowsSkipped: number;
  rowsDuplicated: number;
  totalIncome: number;
  totalExpense: number;
  totalCharges: number;
  totalCredits: number;
  createdAt: string;
  confirmedAt: string | null;
  organization?: Ref;
  bankAccount?: Pick<BankAccount, 'id' | 'name' | 'accountNumber'> | null;
}

export interface DocumentRecord extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  fileName: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSize: number | null;
  documentType: DocumentType;
  status: DocumentStatus;
  clientName: string | null;
  tags: string[];
  aiSummary: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategicDecision extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  context: string | null;
  decision: string;
  rationale: string | null;
  risks: string | null;
  nextStep: string | null;
  decisionDate: string | null;
  status: DecisionStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
