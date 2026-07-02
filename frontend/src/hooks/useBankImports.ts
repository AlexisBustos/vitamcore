// Hooks de cuentas bancarias, movimientos y lotes de importación financiera.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  BankAccount,
  BankCategoryBreakdown,
  BankMonthlyPoint,
  BankTransactionsResponse,
  FinancialImportBatch,
  FinancialImportType,
  SalesImportSummary,
} from '@/types/domain';
import { invalidateFinance } from './finance-shared';

export type FinanceImportFilters = {
  organizationId?: string;
  bankAccountId?: string;
  type?: FinancialImportType;
};

export type ImportPreviewInput = {
  organizationId: string;
  bankAccountId?: string;
  type: FinancialImportType;
  periodMonth: string;
  file: File;
};

export type ImportPreviewRow = {
  status: 'VALID' | 'WARNING' | 'DUPLICATE' | 'ERROR';
  dedupeKey: string;
  warnings: string[];
  data: Record<string, unknown>;
  rawData: Record<string, unknown>;
};

export type ImportPreviewResponse = {
  batch: FinancialImportBatch;
  rows: ImportPreviewRow[];
  salesSummary: SalesImportSummary | null;
};

// ----- Importaciones financieras -----
export function useBankAccounts(organizationId?: string) {
  return useQuery({
    queryKey: ['finance-imports', 'accounts', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: BankAccount[] }>(
          `/finance/imports/accounts${toQuery({ organizationId })}`,
        )
        .then((r) => r.data),
  });
}

export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<{ data: BankAccount }>('/finance/imports/accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; data: Record<string, unknown> }) =>
      api.patch<{ data: BankAccount }>(
        `/finance/imports/accounts/${payload.id}`,
        payload.data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export type BankTransactionFilters = {
  organizationId?: string;
  bankAccountId?: string;
  month?: string;
  search?: string;
  category?: string;
  reconciliation?: 'linked' | 'unlinked';
};

export function useBankTransactions(filters: BankTransactionFilters = {}) {
  return useQuery({
    queryKey: ['finance-imports', 'transactions', filters],
    queryFn: () =>
      api
        .get<{ data: BankTransactionsResponse }>(
          `/finance/imports/transactions${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useBankTransactionMonths(filters: {
  organizationId?: string;
  bankAccountId?: string;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'transaction-months', filters],
    queryFn: () =>
      api
        .get<{ data: string[] }>(
          `/finance/imports/transactions/months${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useBankMonthly(filters: {
  organizationId?: string;
  bankAccountId?: string;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'monthly', filters],
    queryFn: () =>
      api
        .get<{ data: BankMonthlyPoint[] }>(
          `/finance/imports/transactions/monthly${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useBankByCategory(filters: {
  organizationId?: string;
  bankAccountId?: string;
  month?: string;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'by-category', filters],
    queryFn: () =>
      api
        .get<{ data: BankCategoryBreakdown[] }>(
          `/finance/imports/transactions/by-category${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useFinanceImportBatches(filters: FinanceImportFilters = {}) {
  return useQuery({
    queryKey: ['finance-imports', 'batches', filters],
    queryFn: () =>
      api
        .get<{ data: FinancialImportBatch[] }>(
          `/finance/imports/batches${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useFinanceImportPreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportPreviewInput) => {
      const formData = new FormData();
      formData.append('organizationId', input.organizationId);
      formData.append('type', input.type);
      formData.append('periodMonth', input.periodMonth);
      formData.append('file', input.file);
      if (input.bankAccountId) {
        formData.append('bankAccountId', input.bankAccountId);
      }
      return api
        .postForm<{ data: ImportPreviewResponse }>(
          '/finance/imports/preview',
          formData,
        )
        .then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useConfirmFinanceImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      api.post('/finance/imports/confirm', { batchId }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
