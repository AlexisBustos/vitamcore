import { useState } from 'react';
import { CircleDollarSign, Pencil, Plus, Target, TrendingUp, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { SalesStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney, isOverdue, salesStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSales, useSalesSummary, useDeleteSale, type SalesFilters } from '@/hooks/useSales';
import type { SalesOpportunity } from '@/types/domain';
import { SalesForm } from './SalesForm';

export function SalesPage() {
  const [filters, setFilters] = useState<SalesFilters>({});
  const [form, setForm] = useState<{ open: boolean; item: SalesOpportunity | null }>(
    { open: false, item: null },
  );

  const { data, isLoading, isError, error } = useSales(filters);
  const summary = useSalesSummary(filters.organizationId);
  const remove = useDeleteSale();

  function set(key: keyof SalesFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  async function handleDelete(item: SalesOpportunity) {
    if (!confirm(`¿Eliminar la oportunidad "${item.opportunityName}"?`)) return;
    await remove.mutateAsync(item.id);
  }

  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description="Pipeline comercial de Vitam Healthcare y Vitam Tech."
        actions={
          <Button onClick={() => setForm({ open: true, item: null })}>
            <Plus className="h-4 w-4" /> Nueva oportunidad
          </Button>
        }
      />

      {/* KPIs */}
      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Oportunidades abiertas" value={String(s.openCount)} icon={TrendingUp} />
          <MetricCard title="Monto abierto" value={formatMoney(s.openAmount)} icon={CircleDollarSign} />
          <MetricCard title="Monto ponderado" value={formatMoney(s.weightedAmount)} icon={Target} hint="por probabilidad" />
          <MetricCard
            title="Sin seguimiento"
            value={String(s.noFollowUpCount)}
            tone={s.noFollowUpCount > 0 ? 'warning' : 'default'}
          />
        </div>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Select
            options={salesStatusOptions}
            placeholder="Todos los estados"
            value={filters.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          />
          <Input
            placeholder="Producto / servicio"
            value={filters.productOrService ?? ''}
            onChange={(e) => set('productOrService', e.target.value)}
          />
          <Select
            options={[
              { value: '', label: 'Todas' },
              { value: 'true', label: 'Sin seguimiento' },
            ]}
            value={filters.noFollowUp ?? ''}
            onChange={(e) => set('noFollowUp', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && data.length === 0 && (
        <EmptyState title="Sin oportunidades">
          No hay oportunidades que coincidan con los filtros.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Oportunidad</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 text-right font-medium">Prob.</th>
                  <th className="px-4 py-3 font-medium">Seguimiento</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((o) => {
                  const overdue =
                    isOverdue(o.nextFollowUpDate) &&
                    o.status !== 'WON' &&
                    o.status !== 'LOST';
                  return (
                    <tr key={o.id} className="hover:bg-[var(--color-muted)]/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--color-foreground)]">
                          {o.opportunityName}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {o.clientName}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {o.organization?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <SalesStatusBadge value={o.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(o.estimatedAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
                        {o.probability}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            overdue
                              ? 'font-medium text-[var(--color-danger)]'
                              : 'text-[var(--color-muted-foreground)]'
                          }
                        >
                          {formatDate(o.nextFollowUpDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar"
                            onClick={() => setForm({ open: true, item: o })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Eliminar"
                            onClick={() => handleDelete(o)}
                          >
                            <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {form.open && (
        <SalesForm
          open={form.open}
          onClose={() => setForm({ open: false, item: null })}
          opportunity={form.item}
          defaultOrganizationId={filters.organizationId}
        />
      )}
    </div>
  );
}
