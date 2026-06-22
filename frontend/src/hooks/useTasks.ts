import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Task, TaskStatus } from '@/types/domain';

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

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch(`/tasks/${id}`, { status }),
    // Actualización optimista: mueve la tarjeta de columna al instante.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: KEY });
      for (const [key, tasks] of snapshots) {
        if (!tasks) continue;
        qc.setQueryData<Task[]>(
          key,
          tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      // Si el PATCH falla, revierte al estado previo: la tarjeta "salta" de
      // vuelta a su columna original, lo que señala visualmente el fallo.
      // (No hay sistema de toasts; el rollback + el refetch de onSettled
      // bastan para reflejar el estado real del servidor.)
      context?.snapshots.forEach(([key, tasks]) => {
        qc.setQueryData(key, tasks);
      });
    },
    onSettled: () => invalidateTaskGraph(qc),
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
