import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'CEO' | 'ADMIN' | 'COLABORADOR';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const KEY = ['users'];

export function useUsers() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ data: AdminUser[] }>('/users').then((r) => r.data),
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch(`/users/${payload.id}`, payload.data)
        : api.post('/users', payload.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
