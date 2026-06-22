import { useState } from 'react';
import { Check, Eye, Lightbulb, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import {
  agentTypeLabels,
  agentTypeOptions,
  insightStatus,
  insightStatusOptions,
  insightTypeLabels,
} from '@/lib/agent-domain';
import { formatDate, priorityOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useInsights, useUpdateInsightStatus } from '@/hooks/useAgent';

export function InsightsPanel() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const { data, isLoading, isError, error } = useInsights(filters);
  const update = useUpdateInsightStatus();

  function set(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Select
            options={agentTypeOptions}
            placeholder="Todos los agentes"
            value={filters.agentType ?? ''}
            onChange={(e) => set('agentType', e.target.value)}
          />
          <Select
            options={insightStatusOptions}
            placeholder="Todos los estados"
            value={filters.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          />
          <Select
            options={priorityOptions}
            placeholder="Todas las prioridades"
            value={filters.priority ?? ''}
            onChange={(e) => set('priority', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && (
        <EmptyState title="Sin insights">
          Guarda insights desde el asistente para verlos aquí.
        </EmptyState>
      )}

      {data &&
        data.map((ins) => {
          const tone = insightStatus[ins.status];
          return (
            <Card key={ins.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)]">
                      <Lightbulb className="h-4 w-4 text-[var(--color-warning)]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--color-foreground)]">
                        {ins.title}
                      </h3>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {agentTypeLabels[ins.agentType]} ·{' '}
                        {insightTypeLabels[ins.type]} · {formatDate(ins.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge value={ins.priority} />
                    <Badge className={tone.className}>{tone.label}</Badge>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm text-[var(--color-muted-foreground)]">
                  {ins.summary}
                </p>
                {ins.recommendation && (
                  <p className="mt-2 text-sm text-[var(--color-foreground)]">
                    <strong>Recomendación:</strong> {ins.recommendation}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: ins.id, status: 'REVIEWED' })}
                  >
                    <Eye className="h-4 w-4" /> Revisar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: ins.id, status: 'ACTIONED' })}
                  >
                    <Check className="h-4 w-4 text-[var(--color-success)]" /> Accionar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: ins.id, status: 'DISMISSED' })}
                  >
                    <X className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Descartar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
