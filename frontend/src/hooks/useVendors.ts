import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Vendor, VendorDetail } from '@/types/domain';

export type VendorFilters = {
  organizationId?: string;
  search?: string;
};

export function useVendors(filters: VendorFilters = {}) {
  return useQuery({
    queryKey: ['vendors', 'list', filters],
    queryFn: () =>
      api
        .get<{ data: Vendor[] }>(`/vendors${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useVendorDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['vendors', 'detail', id],
    enabled: !!id,
    queryFn: () =>
      api.get<{ data: VendorDetail }>(`/vendors/${id}`).then((r) => r.data),
  });
}
