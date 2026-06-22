import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { proposedTaskStatus } from '@/lib/agent-domain';
import { formatDate } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useProposedTasks, useProposedTaskAction } from '@/hooks/useAgent';
import { useOrganizations } from '@/hooks/useOrganizations';

export function ProposedTasksPanel() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const { data, isLoading, isError, error } = useProposedTasks(filters);
  const action = useProposedTaskAction();
  const { data: orgs } = useOrganizations();

  const orgName = (id: string) => orgs?.find((o) => o.id === id)?.name ?? id;

  function set(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Select
            options={[
              { value: 'PROPOSED', label: 'Propuesta' },
              { value: 'APPROVED', label: 'Aprobada' },
              { value: 'REJECTED', label: 'Rechazada' },
              { value: 'CONVERTED_TO_TASK', label: 'Convertida en tarea' },
            ]}
            placeholder="Todos los estados"
            value={filters.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && (
        <EmptyState title="Sin tareas propuestas">
          Propón tareas desde el asistente para revisarlas aquí.
        </EmptyState>
      )}

      {data &&
        data.map((t) => {
          const tone = proposedTaskStatus[t.status];
          const closed =
            t.status === 'CONVERTED_TO_TASK' || t.status === 'REJECTED';
          return (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-[var(--color-foreground)]">
                      {t.title}
                    </h3>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {orgName(t.organizationId)} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge value={t.priority} />
                    <Badge className={tone.className}>{tone.label}</Badge>
                  </div>
                </div>

                {t.rationale && (
                  <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                    <strong>Motivo:</strong> {t.rationale}
                  </p>
                )}

                {!closed && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        action.mutate({ id: t.id, action: 'convert' })
                      }
                      disabled={action.isPending}
                    >
                      <ArrowRight className="h-4 w-4" /> Convertir en tarea
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        action.mutate({ id: t.id, action: 'approve' })
                      }
                      disabled={action.isPending}
                    >
                      <Check className="h-4 w-4 text-[var(--color-success)]" /> Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        action.mutate({ id: t.id, action: 'reject' })
                      }
                      disabled={action.isPending}
                    >
                      <X className="h-4 w-4 text-[var(--color-danger)]" /> Rechazar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
