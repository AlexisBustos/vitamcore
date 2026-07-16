// Hooks de resumen financiero (KPIs y vista consolidada) por empresa/unidad/proyecto.
import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { FinanceSummary, ConsolidatedResponse } from '@/types/domain';
import type { Granularity } from './finance-shared';

// ----- Resumen financiero -----
// El resumen siempre trae mes en curso + semana en curso (pulso). granularity y
// period solo acotan los desgloses por categoría/empresa; por defecto, el mes.
export function useFinanceSummary(
  organizationId?: string,
  filters: { granularity?: Granularity; period?: string } = {},
) {
  return useQuery({
    queryKey: [
      'finance',
      'summary',
      organizationId ?? 'all',
      filters.granularity ?? 'month',
      filters.period ?? 'current',
    ],
    queryFn: () =>
      api
        .get<{ data: FinanceSummary }>(
          `/finance/summary${toQuery({ organizationId, ...filters })}`,
        )
        .then((r) => r.data),
  });
}

export function useConsolidated(filters: {
  organizationId?: string;
  granularity?: Granularity;
  period?: string;
}) {
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
