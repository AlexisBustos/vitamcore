import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  AutoReconcileResult,
  RecognizeTransfersResult,
  ReconciliationCandidate,
} from '@/types/domain';
import { invalidateFinance } from './finance-shared';

export { useIncome, useIncomeMonths, useSaveIncome, useDeleteIncome, useRegisterPayment } from './useIncome';
export { useExpenses, useExpenseMonths, useSaveExpense, useDeleteExpense, useRegisterExpensePayment } from './useExpenses';
export type { FinanceFilters } from './finance-shared';
export { useFinanceSummary, useConsolidated } from './useFinanceSummary';
export {
  useBankCategories, useSaveCategory, useDeleteCategory, useCategoryRules,
  useSaveRule, useDeleteRule, useReorderRules, useReapplyRules, useRulePreview,
  useBulkSetCategory, useSetTransactionCategory,
} from './useBankCategories';
export {
  useBankAccounts, useCreateBankAccount, useUpdateBankAccount,
  useBankTransactions, useBankTransactionMonths, useBankMonthly, useBankByCategory,
  useFinanceImportBatches, useFinanceImportPreview, useConfirmFinanceImport,
} from './useBankImports';
export type {
  FinanceImportFilters, ImportPreviewInput, ImportPreviewRow, ImportPreviewResponse,
  BankTransactionFilters,
} from './useBankImports';

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
