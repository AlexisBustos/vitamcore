import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Añade un comentario a una tarea e invalida su detalle para refrescar el feed. */
export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post(`/tasks/${taskId}/comments`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] }),
  });
}
