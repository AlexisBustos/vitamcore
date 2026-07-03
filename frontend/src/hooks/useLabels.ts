import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Label } from '@/types/domain';

export function useLabels(organizationId?: string) {
  return useQuery({
    queryKey: ['labels', organizationId],
    enabled: !!organizationId,
    queryFn: () =>
      api.get<{ data: Label[] }>(`/labels${toQuery({ organizationId })}`).then((r) => r.data),
  });
}

export function useSaveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id ? api.patch(`/labels/${payload.id}`, payload.data) : api.post('/labels', payload.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels'] }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/labels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['tasks'] }); // las tarjetas muestran labels
    },
  });
}
