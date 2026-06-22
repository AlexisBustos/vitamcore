import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Organization, OrganizationDetail } from '@/types/domain';

const KEY = ['organizations'];

export function useOrganizations() {
  return useQuery({
    queryKey: KEY,
    queryFn: () =>
      api.get<{ data: Organization[] }>('/organizations').then((r) => r.data),
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: () =>
      api
        .get<{ data: OrganizationDetail }>(`/organizations/${id}`)
        .then((r) => r.data),
  });
}

export function useSaveOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/organizations/${payload.id}`, payload.data)
        : api.post('/organizations', payload.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/organizations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
