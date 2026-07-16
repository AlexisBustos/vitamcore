// Hooks de TanStack Query para gastos.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { ExpenseRecord } from '@/types/domain';
import {
  invalidateFinance,
  type FinanceFilters,
  type Granularity,
} from './finance-shared';

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

export function useExpensePeriods(
  granularity: Granularity,
  organizationId?: string,
) {
  return useQuery({
    queryKey: ['expenses', 'periods', granularity, organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: string[] }>(
          `/expenses/periods${toQuery({ granularity, organizationId })}`,
        )
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

export function useRegisterExpensePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      id: string;
      paidDate?: string | null;
      bankTransactionId?: string | null;
    }) =>
      api.patch(`/expenses/${payload.id}/payment`, {
        paidDate: payload.paidDate ?? null,
        bankTransactionId: payload.bankTransactionId ?? null,
      }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

// Conciliación/pago en lote: N gastos contra un movimiento (bankTransactionId),
// marcado con fecha (paidDate) o reversión (ambos null).
export function useBulkRegisterExpensePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      ids: string[];
      paidDate?: string | null;
      bankTransactionId?: string | null;
    }) =>
      api.post('/expenses/payments/bulk', {
        ids: payload.ids,
        paidDate: payload.paidDate ?? null,
        bankTransactionId: payload.bankTransactionId ?? null,
      }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}
