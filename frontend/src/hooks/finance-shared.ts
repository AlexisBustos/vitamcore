// Helpers compartidos por los hooks de finanzas (income, expenses, imports...).
import type { useQueryClient } from '@tanstack/react-query';

// Granularidad + clave de período: la semana es lente, el mes es la verdad.
export type Granularity = 'week' | 'month';
export type PeriodSelection = { granularity: Granularity; period?: string };

export type FinanceFilters = {
  organizationId?: string;
  businessUnitId?: string;
  projectId?: string;
  category?: string;
  status?: string;
  isRecurring?: string;
  documentKind?: string;
  paymentState?: 'receivable' | 'payable' | 'overdue' | 'paid' | 'cancelled';
  granularity?: Granularity;
  period?: string;
  search?: string;
};

export function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['income'] });
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['finance'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  // Las métricas de clientes y proveedores se derivan de sus documentos
  // (ingresos/gastos), así que cualquier mutación del libro las refresca.
  qc.invalidateQueries({ queryKey: ['clients'] });
  qc.invalidateQueries({ queryKey: ['vendors'] });
}
