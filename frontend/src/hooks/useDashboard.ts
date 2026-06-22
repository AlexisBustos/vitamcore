import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { DashboardSummary } from '@/types/domain';

export function useDashboard(organizationId?: string) {
  return useQuery({
    queryKey: ['dashboard', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: DashboardSummary }>(
          `/dashboard/summary${toQuery({ organizationId })}`,
        )
        .then((r) => r.data),
  });
}
