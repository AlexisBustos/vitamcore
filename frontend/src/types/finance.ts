/**
 * Tipos del libro financiero (ingresos/gastos), partes (clientes/proveedores)
 * y conciliación bancaria.
 */

import type { ContextRefs, Ref } from './core';

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
  weekIncome: number;
  weekExpense: number;
  // Período al que corresponden los desgloses por categoría/empresa.
  breakdownPeriod: { granularity: 'week' | 'month'; key: string };
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

// ---- Tendencia (Fase 4 granularidad semanal) ----
// Un punto por período; los períodos sin datos vienen en cero (hueco explícito).
export interface TrendPoint {
  period: string; // 'YYYY-Www' o 'YYYY-MM'
  income: number;
  expense: number;
  result: number; // income − expense
}
