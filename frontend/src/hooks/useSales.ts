import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { SalesOpportunity, SalesSummary } from '@/types/domain';

const KEY = ['sales'];

export type SalesFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  status?: string;
  productOrService?: string;
  minProbability?: string;
  noFollowUp?: string;
};

export function useSales(filters: SalesFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () =>
      api
        .get<{ data: SalesOpportunity[] }>(`/sales${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useSalesSummary(organizationId?: string) {
  return useQuery({
    queryKey: [...KEY, 'summary', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: SalesSummary }>(
          `/sales/summary${toQuery({ organizationId })}`,
        )
        .then((r) => r.data),
  });
}

export function useSaveSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/sales/${payload.id}`, payload.data)
        : api.post('/sales', payload.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
