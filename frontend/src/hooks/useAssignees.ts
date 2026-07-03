import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Assignee {
  id: string;
  name: string;
  role: 'CEO' | 'ADMIN' | 'COLABORADOR';
}

export function useAssignees() {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: () => api.get<{ data: Assignee[] }>('/assignees').then((r) => r.data),
  });
}
