import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  BankAccount,
  BankCategory,
  BankCategoryBreakdown,
  BankCategoryRule,
  BankMonthlyPoint,
  BankTransactionsResponse,
  FinancialImportBatch,
  FinancialImportType,
  ConsolidatedResponse,
  AutoReconcileResult,
  RecognizeTransfersResult,
  FinanceSummary,
  ReconciliationCandidate,
  SalesImportSummary,
} from '@/types/domain';
import { invalidateFinance } from './finance-shared';

export { useIncome, useIncomeMonths, useSaveIncome, useDeleteIncome, useRegisterPayment } from './useIncome';
export { useExpenses, useExpenseMonths, useSaveExpense, useDeleteExpense, useRegisterExpensePayment } from './useExpenses';
export type { FinanceFilters } from './finance-shared';

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

export function useConsolidated(filters: { organizationId?: string; month?: string }) {
  return useQuery({
    queryKey: ['finance', 'consolidated', filters],
    queryFn: () =>
      api
        .get<{ data: ConsolidatedResponse }>(
          `/finance/consolidated${toQuery(filters)}`,
        )
        .then((r) => r.data),
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

// ----- Categorías y reglas de movimientos bancarios -----
export function useBankCategories() {
  return useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: () =>
      api
        .get<{ data: BankCategory[] }>('/finance/categories?includeInactive=true')
        .then((r) => r.data),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { key?: string; name: string; kind: string; active?: boolean; sortOrder?: number }) =>
      payload.key
        ? api.patch(`/finance/categories/${payload.key}`, payload)
        : api.post('/finance/categories', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'categories'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.del(`/finance/categories/${key}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'categories'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useCategoryRules() {
  return useQuery({
    queryKey: ['finance', 'category-rules'],
    queryFn: () =>
      api.get<{ data: BankCategoryRule[] }>('/finance/category-rules').then((r) => r.data),
  });
}

function invalidateRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['finance', 'category-rules'] });
  qc.invalidateQueries({ queryKey: ['finance-imports'] }); // reaplica recategoriza movimientos
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; categoryKey?: string; matchText?: string; direction?: string; active?: boolean }) =>
      payload.id
        ? api.patch(`/finance/category-rules/${payload.id}`, payload)
        : api.post('/finance/category-rules', payload),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/finance/category-rules/${id}`),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useReorderRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/finance/category-rules/reorder', { ids }),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useReapplyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ data: { updated: number } }>('/finance/categories/reapply', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-imports'] }),
  });
}

export function useRulePreview(matchText: string, direction: string) {
  return useQuery({
    queryKey: ['finance', 'rule-preview', matchText, direction],
    enabled: matchText.trim().length > 0,
    queryFn: () =>
      api
        .get<{ data: { count: number } }>(
          `/finance/category-rules/preview${toQuery({ matchText, direction })}`,
        )
        .then((r) => r.data),
  });
}

export function useBulkSetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; category: string | null }) =>
      api.post('/finance/imports/transactions/bulk-category', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-imports'] }),
  });
}

export function useSetTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; category: string | null }) =>
      api.patch(`/finance/imports/transactions/${payload.id}/category`, {
        category: payload.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useReconciliationCandidates(
  filters: { recordType: 'income' | 'expense'; recordId: string; search?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['finance-imports', 'reconcile', filters],
    enabled,
    queryFn: () =>
      api
        .get<{ data: ReconciliationCandidate[] }>(
          `/finance/imports/reconciliation/candidates${toQuery(filters)}`,
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

export function useAutoReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      organizationId: string;
      month?: string;
      apply: boolean;
      selection?: { invoiceId: string; movId: string }[];
    }) =>
      api
        .post<{ data: AutoReconcileResult }>(
          '/finance/reconciliation/auto',
          payload,
        )
        .then((r) => r.data),
    // Solo el modo aplicar muta datos; el preview no invalida nada. Marca
    // facturas/gastos como PAID, así que invalida también clients (fichas de
    // cobranza) igual que useRegisterPayment.
    onSuccess: (_data, vars) => {
      if (vars.apply) {
        invalidateFinance(qc);
        qc.invalidateQueries({ queryKey: ['finance-imports'] });
        qc.invalidateQueries({ queryKey: ['clients'] });
      }
    },
  });
}

export function useRecognizeTransfers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      organizationId: string;
      month?: string;
      direction: 'expense' | 'income';
      category: string;
      apply: boolean;
      selection?: string[];
    }) =>
      api
        .post<{ data: RecognizeTransfersResult }>(
          '/finance/reconciliation/recognize-transfers',
          payload,
        )
        .then((r) => r.data),
    // Solo aplicar muta datos: crea gastos/ingresos PAID enlazados a su movimiento.
    onSuccess: (_data, vars) => {
      if (vars.apply) {
        invalidateFinance(qc);
        qc.invalidateQueries({ queryKey: ['finance-imports'] });
        qc.invalidateQueries({ queryKey: ['clients'] });
      }
    },
  });
}
