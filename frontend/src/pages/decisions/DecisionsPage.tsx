import { useState } from 'react';
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { DecisionStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { decisionStatusOptions, formatDate } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useDecisions,
  useDeleteDecision,
  type DecisionFilters,
} from '@/hooks/useDecisions';
import type { StrategicDecision } from '@/types/domain';
import { DecisionForm } from './DecisionForm';

export function DecisionsPage() {
  const [filters, setFilters] = useState<DecisionFilters>({});
  const [form, setForm] = useState<{ open: boolean; item: StrategicDecision | null }>(
    { open: false, item: null },
  );

  const { data, isLoading, isError, error } = useDecisions(filters);
  const remove = useDeleteDecision();

  function set(key: keyof DecisionFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  async function handleDelete(item: StrategicDecision) {
    if (!confirm(`¿Eliminar la decisión "${item.title}"?`)) return;
    await remove.mutateAsync(item.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Decisiones estratégicas"
        description="Memoria estratégica de la dirección ejecutiva."
        actions={
          <Button onClick={() => setForm({ open: true, item: null })}>
            <Plus className="h-4 w-4" /> Nueva decisión
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Select
            options={decisionStatusOptions}
            placeholder="Todos los estados"
            value={filters.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && (
        <EmptyState title="Sin decisiones">
          Registra la primera decisión estratégica.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <div className="space-y-4">
          {data.map((dec) => (
            <Card key={dec.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[var(--color-foreground)]">
                        {dec.title}
                      </h3>
                      <DecisionStatusBadge value={dec.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                      {dec.organization?.name}
                      {dec.project ? ` · ${dec.project.name}` : ''}
                      {dec.decisionDate ? ` · ${formatDate(dec.decisionDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Editar"
                      onClick={() => setForm({ open: true, item: dec })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Eliminar"
                      onClick={() => handleDelete(dec)}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                    </Button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-[var(--color-foreground)]">
                  {dec.decision}
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {dec.context && <Block label="Contexto" value={dec.context} />}
                  {dec.rationale && <Block label="Fundamento" value={dec.rationale} />}
                  {dec.risks && <Block label="Riesgos" value={dec.risks} />}
                </div>

                {dec.nextStep && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)]">
                    <ArrowRight className="h-4 w-4" /> {dec.nextStep}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {form.open && (
        <DecisionForm
          open={form.open}
          onClose={() => setForm({ open: false, item: null })}
          decision={form.item}
          defaultOrganizationId={filters.organizationId}
        />
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p className="whitespace-pre-line text-sm text-[var(--color-foreground)]">
        {value}
      </p>
    </div>
  );
}
