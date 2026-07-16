// Hooks de TanStack Query para ingresos.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { IncomeRecord } from '@/types/domain';
import {
  invalidateFinance,
  type FinanceFilters,
  type Granularity,
} from './finance-shared';

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

export function useIncomePeriods(
  granularity: Granularity,
  organizationId?: string,
) {
  return useQuery({
    queryKey: ['income', 'periods', granularity, organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: string[] }>(
          `/income/periods${toQuery({ granularity, organizationId })}`,
        )
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
    onSuccess: () => {
      invalidateFinance(qc);
    },
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/income/${id}`),
    onSuccess: () => {
      invalidateFinance(qc);
    },
  });
}

export function useRegisterPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      id: string;
      paidDate?: string | null;
      bankTransactionId?: string | null;
    }) =>
      api.patch(`/income/${payload.id}/payment`, {
        paidDate: payload.paidDate ?? null,
        bankTransactionId: payload.bankTransactionId ?? null,
      }),
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

// Conciliación/pago en lote: N facturas contra un movimiento (bankTransactionId),
// marcado con fecha (paidDate) o reversión (ambos null).
export function useBulkRegisterPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      ids: string[];
      paidDate?: string | null;
      bankTransactionId?: string | null;
    }) =>
      api.post('/income/payments/bulk', {
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
