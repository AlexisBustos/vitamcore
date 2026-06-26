import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  BankAccount,
  ExpenseRecord,
  FinancialImportBatch,
  FinancialImportType,
  FinanceSummary,
  IncomeRecord,
  SalesImportSummary,
} from '@/types/domain';

export type FinanceFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  category?: string;
  status?: string;
  isRecurring?: string;
  documentKind?: string;
  paymentState?: 'receivable' | 'overdue' | 'paid' | 'cancelled';
  month?: string;
};

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

// ----- Resumen financiero -----
export function useFinanceSummary(organizationId?: string) {
  return useQuery({
    queryKey: ['finance', 'summary', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: FinanceSummary }>(
          `/finance/summary${toQuery({ organizationId })}`,
        )
        .then((r) => r.data),
  });
}

// ----- Ingresos -----
export function useIncome(filters: FinanceFilters = {}) {
  return useQuery({
    queryKey: ['income', filters],
    queryFn: () =>
      api
        .get<{ data: IncomeRecord[] }>(`/income${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useIncomeMonths(organizationId?: string) {
  return useQuery({
    queryKey: ['income', 'months', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: string[] }>(`/income/months${toQuery({ organizationId })}`)
        .then((r) => r.data),
  });
}

export function useSaveIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/income/${payload.id}`, payload.data)
        : api.post('/income', payload.data),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/income/${id}`),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useRegisterPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; paidDate: string | null }) =>
      api.patch(`/income/${payload.id}/payment`, { paidDate: payload.paidDate }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// ----- Gastos -----
export function useExpenses(filters: FinanceFilters = {}) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () =>
      api
        .get<{ data: ExpenseRecord[] }>(`/expenses${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useSaveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/expenses/${payload.id}`, payload.data)
        : api.post('/expenses', payload.data),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/expenses/${id}`),
    onSuccess: () => invalidateFinance(qc),
  });
}

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

function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['income'] });
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['finance'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}
