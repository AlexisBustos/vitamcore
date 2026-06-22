import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  ExpenseRecord,
  FinanceSummary,
  IncomeRecord,
} from '@/types/domain';

export type FinanceFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  category?: string;
  status?: string;
  isRecurring?: string;
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

function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['income'] });
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['finance'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}
