// Hooks de conciliación: candidatos de conciliación manual, auto-conciliación y
// reconocimiento de transferencias internas.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  AutoReconcileResult,
  ReconciliationCandidate,
  RecognizeTransfersResult,
} from '@/types/domain';
import { invalidateFinance, type Granularity } from './finance-shared';

export function useReconciliationCandidates(
  filters: {
    recordType: 'income' | 'expense';
    recordId?: string;
    // Modo por monto: conciliar varias facturas contra la suma seleccionada.
    organizationId?: string;
    amount?: number;
    search?: string;
  },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['finance-imports', 'reconcile', filters],
    enabled,
    queryFn: () =>
      api
        .get<{ data: ReconciliationCandidate[] }>(
          `/finance/imports/reconciliation/candidates${toQuery({
            recordType: filters.recordType,
            recordId: filters.recordId,
            organizationId: filters.organizationId,
            amount: filters.amount != null ? String(filters.amount) : undefined,
            search: filters.search,
          })}`,
        )
        .then((r) => r.data),
  });
}

export function useAutoReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      organizationId: string;
      granularity: Granularity;
      period?: string;
      apply: boolean;
      selection?: { invoiceId: string; movId: string }[];
    }) =>
      api
        .post<{ data: AutoReconcileResult }>(
          '/finance/reconciliation/auto',
          payload,
        )
        .then((r) => r.data),
    // Solo el modo aplicar muta datos; el preview no invalida nada. Marca
    // facturas/gastos como PAID; invalidateFinance ya incluye clients
    // (fichas de cobranza) de forma centralizada.
    onSuccess: (_data, vars) => {
      if (vars.apply) {
        invalidateFinance(qc);
        qc.invalidateQueries({ queryKey: ['finance-imports'] });
      }
    },
  });
}

export function useRecognizeTransfers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      organizationId: string;
      granularity: Granularity;
      period?: string;
      direction: 'expense' | 'income';
      category: string;
      apply: boolean;
      selection?: string[];
    }) =>
      api
        .post<{ data: RecognizeTransfersResult }>(
          '/finance/reconciliation/recognize-transfers',
          payload,
        )
        .then((r) => r.data),
    // Solo aplicar muta datos: crea gastos/ingresos PAID enlazados a su movimiento.
    onSuccess: (_data, vars) => {
      if (vars.apply) {
        invalidateFinance(qc);
        qc.invalidateQueries({ queryKey: ['finance-imports'] });
      }
    },
  });
}
