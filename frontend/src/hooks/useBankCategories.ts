// Hooks de categorías y reglas de categorización de movimientos bancarios.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { BankCategory, BankCategoryRule } from '@/types/domain';

// ----- Categorías y reglas de movimientos bancarios -----
export function useBankCategories() {
  return useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: () =>
      api
        .get<{ data: BankCategory[] }>('/finance/categories?includeInactive=true')
        .then((r) => r.data),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { key?: string; name: string; kind: string; active?: boolean; sortOrder?: number }) =>
      payload.key
        ? api.patch(`/finance/categories/${payload.key}`, payload)
        : api.post('/finance/categories', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'categories'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.del(`/finance/categories/${key}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'categories'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useCategoryRules() {
  return useQuery({
    queryKey: ['finance', 'category-rules'],
    queryFn: () =>
      api.get<{ data: BankCategoryRule[] }>('/finance/category-rules').then((r) => r.data),
  });
}

function invalidateRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['finance', 'category-rules'] });
  qc.invalidateQueries({ queryKey: ['finance-imports'] }); // reaplica recategoriza movimientos
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; categoryKey?: string; matchText?: string; direction?: string; active?: boolean }) =>
      payload.id
        ? api.patch(`/finance/category-rules/${payload.id}`, payload)
        : api.post('/finance/category-rules', payload),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/finance/category-rules/${id}`),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useReorderRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/finance/category-rules/reorder', { ids }),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useReapplyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ data: { updated: number } }>('/finance/categories/reapply', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-imports'] }),
  });
}

export function useRulePreview(matchText: string, direction: string) {
  return useQuery({
    queryKey: ['finance', 'rule-preview', matchText, direction],
    enabled: matchText.trim().length > 0,
    queryFn: () =>
      api
        .get<{ data: { count: number } }>(
          `/finance/category-rules/preview${toQuery({ matchText, direction })}`,
        )
        .then((r) => r.data),
  });
}

export function useBulkSetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; category: string | null }) =>
      api.post('/finance/imports/transactions/bulk-category', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-imports'] }),
  });
}

export function useSetTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; category: string | null }) =>
      api.patch(`/finance/imports/transactions/${payload.id}/category`, {
        category: payload.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}
