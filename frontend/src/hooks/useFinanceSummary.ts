// Hooks de resumen financiero (KPIs y vista consolidada) por empresa/unidad/proyecto.
import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { FinanceSummary, ConsolidatedResponse, TrendPoint, Cashflow } from '@/types/domain';
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

// Tendencia: serie income/expense/result de los últimos `last` períodos.
export function useFinanceTrend(filters: {
  granularity: Granularity;
  last?: number;
  organizationId?: string;
}) {
  return useQuery({
    queryKey: ['finance', 'trend', filters],
    queryFn: () =>
      api
        .get<{ data: TrendPoint[] }>(
          `/finance/trend${toQuery({
            organizationId: filters.organizationId,
            granularity: filters.granularity,
            last: filters.last != null ? String(filters.last) : undefined,
          })}`,
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

// Flujo de caja proyectado: saldo bancario + por cobrar/pagar + recurrentes,
// semana a semana en el horizonte pedido (4–12).
export function useCashflow(organizationId?: string, weeks = 8) {
  return useQuery({
    queryKey: ['finance', 'cashflow', organizationId ?? 'all', weeks],
    queryFn: () =>
      api
        .get<{ data: Cashflow }>(
          `/finance/cashflow${toQuery({ organizationId, weeks: String(weeks) })}`,
        )
        .then((r) => r.data),
  });
}
