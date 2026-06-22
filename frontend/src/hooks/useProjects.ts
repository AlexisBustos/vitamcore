import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Project, ProjectDetail } from '@/types/domain';

const KEY = ['projects'];

export type ProjectFilters = {
  organizationId?: string;
  businessUnitId?: string;
  status?: string;
  priority?: string;
};

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () =>
      api
        .get<{ data: Project[] }>(`/projects${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    enabled: !!id,
    queryFn: () =>
      api.get<{ data: ProjectDetail }>(`/projects/${id}`).then((r) => r.data),
  });
}

export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/projects/${payload.id}`, payload.data)
        : api.post('/projects', payload.data),
    onSuccess: () => invalidateProjectGraph(qc),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/projects/${id}`),
    onSuccess: () => invalidateProjectGraph(qc),
  });
}

function invalidateProjectGraph(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: ['organizations'] });
  qc.invalidateQueries({ queryKey: ['tasks'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}
