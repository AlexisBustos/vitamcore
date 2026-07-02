/**
 * Tipos de dominio bancario: cuentas, movimientos, categorización y
 * lotes de importación financiera.
 */

import type { Ref } from './core';

export type FinancialImportType =
  | 'SALES_REPORT'
  | 'PURCHASE_REPORT'
  | 'BANK_STATEMENT';
export type FinancialImportStatus = 'PREVIEW' | 'CONFIRMED' | 'FAILED';

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

export type BankCategoryKind = 'INCOME' | 'EXPENSE' | 'NEUTRAL';
export type RuleDirection = 'CHARGE' | 'CREDIT' | 'ANY';

export interface BankCategory {
  id: string;
  key: string;
  name: string;
  kind: BankCategoryKind;
  active: boolean;
  sortOrder: number;
}

export interface BankCategoryRule {
  id: string;
  categoryKey: string;
  matchText: string;
  direction: RuleDirection;
  priority: number;
  active: boolean;
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
  reconciled: boolean;
  internal: boolean;
  createdAt: string;
  organization?: Ref;
  bankAccount?: Pick<BankAccount, 'id' | 'name' | 'accountNumber'>;
}

export interface ReconciliationCandidate {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
  exact: boolean;
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
