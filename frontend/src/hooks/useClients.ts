import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Client, ClientDetail } from '@/types/domain';

export type ClientFilters = {
  organizationId?: string;
  search?: string;
};

export function useClients(filters: ClientFilters = {}) {
  return useQuery({
    queryKey: ['clients', 'list', filters],
    queryFn: () =>
      api
        .get<{ data: Client[] }>(`/clients${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useClientDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', 'detail', id],
    enabled: !!id,
    queryFn: () =>
      api.get<{ data: ClientDetail }>(`/clients/${id}`).then((r) => r.data),
  });
}
