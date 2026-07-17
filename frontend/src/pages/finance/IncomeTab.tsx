import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { PeriodFilter } from '@/components/PeriodFilter';
import { ExportExcelButton } from '@/components/ExportExcelButton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { IncomeStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney, incomeStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useIncome,
  useDeleteIncome,
  useIncomePeriods,
  type FinanceFilters,
  type Granularity,
} from '@/hooks/useFinance';
import type { IncomeRecord } from '@/types/domain';
import { IncomeForm } from './IncomeForm';

export function IncomeTab({ organizationId }: { organizationId?: string }) {
  const [extra, setExtra] = useState<{
    category?: string;
    status?: string;
    granularity: Granularity;
    period?: string;
  }>({ granularity: 'month' });
  const [form, setForm] = useState<{ open: boolean; item: IncomeRecord | null }>(
    { open: false, item: null },
  );

  const filters: FinanceFilters = { organizationId, ...extra };
  const { data, isLoading, isError, error } = useIncome(filters);
  const remove = useDeleteIncome();
  const { data: periods = [] } = useIncomePeriods(extra.granularity, organizationId);

  async function handleDelete(item: IncomeRecord) {
    if (!confirm(`¿Eliminar el ingreso "${item.description}"?`)) return;
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
            options={incomeStatusOptions}
            placeholder="Todos los estados"
            value={extra.status ?? ''}
            onChange={(e) =>
              setExtra((x) => ({ ...x, status: e.target.value || undefined }))
            }
          />
          <PeriodFilter
            granularity={extra.granularity}
            period={extra.period}
            periods={periods}
            onGranularityChange={(granularity) =>
              setExtra((x) => ({ ...x, granularity, period: undefined }))
            }
            onPeriodChange={(period) => setExtra((x) => ({ ...x, period }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <ExportExcelButton endpoint="/finance/export/income" params={filters} />
          <Button onClick={() => setForm({ open: true, item: null })}>
            <Plus className="h-4 w-4" /> Nuevo ingreso
          </Button>
        </div>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && <EmptyState title="Sin ingresos" />}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
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
                    <td className="px-4 py-3">
                      {r.clientName ? (
                        r.clientId ? (
                          <Link
                            to={`/clientes/${r.clientId}`}
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {r.clientName}
                          </Link>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">
                            {r.clientName}
                          </span>
                        )
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.organization?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {r.category ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--color-success)]">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <IncomeStatusBadge value={r.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatDate(r.incomeDate ?? r.dueDate)}
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
        <IncomeForm
          open={form.open}
          onClose={() => setForm({ open: false, item: null })}
          income={form.item}
          defaultOrganizationId={organizationId}
        />
      )}
    </div>
  );
}
