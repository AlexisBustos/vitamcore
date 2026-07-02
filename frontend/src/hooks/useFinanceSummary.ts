// Hooks de resumen financiero (KPIs y vista consolidada) por empresa/unidad/proyecto.
import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { FinanceSummary, ConsolidatedResponse } from '@/types/domain';

// ----- Resumen financiero -----
export function useFinanceSummary(organizationId?: string) {
  return useQuery({
    queryKey: ['finance', 'summary', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: FinanceSummary }>(
          `/finance/summary${toQuery({ organizationId })}`,
        )
        .then((r) => r.data),
  });
}

export function useConsolidated(filters: { organizationId?: string; month?: string }) {
  return useQuery({
    queryKey: ['finance', 'consolidated', filters],
    queryFn: () =>
      api
        .get<{ data: ConsolidatedResponse }>(
          `/finance/consolidated${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}
