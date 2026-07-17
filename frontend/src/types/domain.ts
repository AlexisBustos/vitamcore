/**
 * Barrel de compatibilidad de tipos de dominio del frontend.
 * Re-exporta los tipos por subdominio (core, banking, finance, dashboard)
 * para no romper los imports existentes desde '@/types/domain'.
 */

export type {
  OrganizationType, EntityStatus, ProjectStatus, TaskStatus, Priority, TaskSource,
  Ref, Organization, OrganizationDetail, BusinessUnit, Project, ProjectDetail, Task,
  Label, TaskLabel, ChecklistItem, TaskDetail,
  TaskActivityType, TaskComment, TaskActivity,
  DocumentType, DocumentStatus, DocumentRecord, DecisionStatus, StrategicDecision,
} from './core';
export type {
  FinancialImportType, FinancialImportStatus, SalesImportSummary, BankAccount,
  BankTransactionsResponse, BankCategoryBreakdown, BankCategoryKind, RuleDirection,
  BankCategory, BankCategoryRule, BankPeriodicPoint, BankTransaction,
  ReconciliationCandidate, FinancialImportBatch,
  CoverageStatus, CoverageCell, CoverageRow, CoverageResponse,
} from './banking';
export type {
  IncomeStatus, ExpenseStatus, DocumentKind, RecurrenceFrequency, IncomeRecord,
  ExpenseRecord, ClientStats, Client, ClientDetail, VendorStats, Vendor, VendorDetail,
  FinanceSummary, ReconciliationSummary, ConsolidatedOrg, ConsolidatedResponse,
  AutoReconcilePair, AutoReconcileResult, RecognizeTransfer, RecognizeTransfersResult,
  TrendPoint,
} from './finance';
export type { DashboardSummary } from './dashboard';
