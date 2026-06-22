import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { DocumentRecord } from '@/types/domain';

const KEY = ['documents'];

export type DocumentFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  documentType?: string;
  status?: string;
  clientName?: string;
};

export function useDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () =>
      api
        .get<{ data: DocumentRecord[] }>(`/documents${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useSaveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/documents/${payload.id}`, payload.data)
        : api.post('/documents', payload.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
