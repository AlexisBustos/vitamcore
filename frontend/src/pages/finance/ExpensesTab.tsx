import { useState } from 'react';
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ExpenseStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { expenseStatusOptions, formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useExpenses,
  useExpenseMonths,
  useDeleteExpense,
  type FinanceFilters,
} from '@/hooks/useFinance';
import { MonthFilter } from '@/components/MonthFilter';
import type { ExpenseRecord } from '@/types/domain';
import { ExpenseForm } from './ExpenseForm';

export function ExpensesTab({ organizationId }: { organizationId?: string }) {
  const [extra, setExtra] = useState<{
    category?: string;
    status?: string;
    month?: string;
  }>({});
  const [form, setForm] = useState<{ open: boolean; item: ExpenseRecord | null }>(
    { open: false, item: null },
  );

  const filters: FinanceFilters = { organizationId, ...extra };
  const { data, isLoading, isError, error } = useExpenses(filters);
  const { data: months = [] } = useExpenseMonths(organizationId);
  const remove = useDeleteExpense();

  async function handleDelete(item: ExpenseRecord) {
    if (!confirm(`¿Eliminar el gasto "${item.description}"?`)) return;
    await remove.mutateAsync(item.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-3">
          <Input
            placeholder="Categoría"
            value={extra.category ?? ''}
            onChange={(e) =>
              setExtra((x) => ({ ...x, category: e.target.value || undefined }))
            }
          />
          <Select
            options={expenseStatusOptions}
            placeholder="Todos los estados"
            value={extra.status ?? ''}
            onChange={(e) =>
              setExtra((x) => ({ ...x, status: e.target.value || undefined }))
            }
          />
          <MonthFilter
            months={months}
            value={extra.month}
            onChange={(month) => setExtra((x) => ({ ...x, month }))}
          />
        </div>
        <Button onClick={() => setForm({ open: true, item: null })}>
          <Plus className="h-4 w-4" /> Nuevo gasto
        </Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && <EmptyState title="Sin gastos" />}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--color-muted)]/40">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                        {r.description}
                        {r.isRecurring && (
                          <Repeat className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.organization?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.category ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--color-danger)]">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <ExpenseStatusBadge value={r.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatDate(r.expenseDate ?? r.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Editar"
                          onClick={() => setForm({ open: true, item: r })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Eliminar"
                          onClick={() => handleDelete(r)}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {form.open && (
        <ExpenseForm
          open={form.open}
          onClose={() => setForm({ open: false, item: null })}
          expense={form.item}
          defaultOrganizationId={organizationId}
        />
      )}
    </div>
  );
}
