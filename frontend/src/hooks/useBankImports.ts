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
  BankPeriodicPoint,
  BankTransactionsResponse,
  FinancialImportBatch,
  FinancialImportType,
  SalesImportSummary,
} from '@/types/domain';
import { invalidateFinance, type Granularity } from './finance-shared';

export type FinanceImportFilters = {
  organizationId?: string;
  bankAccountId?: string;
  type?: FinancialImportType;
};

export type ImportPreviewInput = {
  organizationId: string;
  bankAccountId?: string;
  type: FinancialImportType;
  periodStart: string;
  periodEnd: string;
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
  batchWarnings: string[];
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
  granularity?: Granularity;
  period?: string;
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

export function useBankTransactionPeriods(filters: {
  organizationId?: string;
  bankAccountId?: string;
  granularity: Granularity;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'transaction-periods', filters],
    queryFn: () =>
      api
        .get<{ data: string[] }>(
          `/finance/imports/transactions/periods${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useBankPeriodic(filters: {
  organizationId?: string;
  bankAccountId?: string;
  granularity: Granularity;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'periodic', filters],
    queryFn: () =>
      api
        .get<{ data: BankPeriodicPoint[] }>(
          `/finance/imports/transactions/periodic${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useBankByCategory(filters: {
  organizationId?: string;
  bankAccountId?: string;
  granularity?: Granularity;
  period?: string;
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
      formData.append('periodStart', input.periodStart);
      formData.append('periodEnd', input.periodEnd);
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
    },
  });
}
