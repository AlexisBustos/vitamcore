import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { StrategicDecision } from '@/types/domain';

const KEY = ['decisions'];

export type DecisionFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  status?: string;
};

export function useDecisions(filters: DecisionFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () =>
      api
        .get<{ data: StrategicDecision[] }>(`/decisions${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useSaveDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/decisions/${payload.id}`, payload.data)
        : api.post('/decisions', payload.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/decisions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
