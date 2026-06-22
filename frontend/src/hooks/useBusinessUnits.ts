import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { BusinessUnit } from '@/types/domain';

const KEY = ['business-units'];

export type BusinessUnitFilters = {
  organizationId?: string;
  status?: string;
};

export function useBusinessUnits(filters: BusinessUnitFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () =>
      api
        .get<{ data: BusinessUnit[] }>(`/business-units${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useSaveBusinessUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/business-units/${payload.id}`, payload.data)
        : api.post('/business-units', payload.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useDeleteBusinessUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/business-units/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
