import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Task } from '@/types/domain';

const KEY = ['tasks'];

export type TaskFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  overdue?: string;
};

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () =>
      api.get<{ data: Task[] }>(`/tasks${toQuery(filters)}`).then((r) => r.data),
  });
}

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/tasks/${payload.id}`, payload.data)
        : api.post('/tasks', payload.data),
    onSuccess: () => invalidateTaskGraph(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/tasks/${id}`),
    onSuccess: () => invalidateTaskGraph(qc),
  });
}

function invalidateTaskGraph(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: ['projects'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}
