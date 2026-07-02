/**
 * Barrel de compatibilidad de tipos de dominio del frontend.
 * Re-exporta los tipos por subdominio (core, sales, banking, finance, dashboard)
 * para no romper los imports existentes desde '@/types/domain'.
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
export type { DashboardSummary } from './dashboard';
