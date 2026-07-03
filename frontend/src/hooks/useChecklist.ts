import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function useInvalidate(taskId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };
}

export function useAddChecklistItem(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (text: string) => api.post(`/tasks/${taskId}/checklist`, { text }),
    onSuccess: invalidate,
  });
}

export function useUpdateChecklistItem(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) =>
      api.patch(`/tasks/${taskId}/checklist/${itemId}`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteChecklistItem(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (itemId: string) => api.del(`/tasks/${taskId}/checklist/${itemId}`),
    onSuccess: invalidate,
  });
}
