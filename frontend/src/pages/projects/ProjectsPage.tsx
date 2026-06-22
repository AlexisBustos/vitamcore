import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ProjectStatusBadge, PriorityBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import {
  formatDate,
  isOverdue,
  priorityOptions,
  projectStatusOptions,
} from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useBusinessUnits } from '@/hooks/useBusinessUnits';
import { useProjects, type ProjectFilters } from '@/hooks/useProjects';
import { ProjectForm } from './ProjectForm';

export function ProjectsPage() {
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [formOpen, setFormOpen] = useState(false);

  const { data: organizations } = useOrganizations();
  const { data: units } = useBusinessUnits(
    filters.organizationId ? { organizationId: filters.organizationId } : {},
  );
  const { data, isLoading, isError, error } = useProjects(filters);

  const orgOptions = useMemo(
    () => (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );
  const unitOptions = useMemo(
    () => (units ?? []).map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  function set(key: keyof ProjectFilters, value: string) {
    setFilters((f) => {
      const next = { ...f, [key]: value || undefined };
      if (key === 'organizationId') next.businessUnitId = undefined;
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyectos"
        description="Cartera de proyectos de todas las empresas."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo proyecto
          </Button>
        }
      />

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            options={orgOptions}
            placeholder="Todas las empresas"
            value={filters.organizationId ?? ''}
            onChange={(e) => set('organizationId', e.target.value)}
          />
          <Select
            options={unitOptions}
            placeholder="Todas las unidades"
            value={filters.businessUnitId ?? ''}
            onChange={(e) => set('businessUnitId', e.target.value)}
            disabled={!filters.organizationId}
          />
          <Select
            options={projectStatusOptions}
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
        <EmptyState title="Sin proyectos">
          No hay proyectos que coincidan con los filtros.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Proyecto</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Prioridad</th>
                  <th className="px-4 py-3 font-medium">Objetivo</th>
                  <th className="px-4 py-3 font-medium">Tareas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-[var(--color-muted)]/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/proyectos/${p.id}`}
                        className="font-medium text-[var(--color-foreground)] hover:text-[var(--color-accent)]"
                      >
                        {p.name}
                      </Link>
                      {p.nextAction && (
                        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                          → {p.nextAction}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {p.organization?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {p.businessUnit?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ProjectStatusBadge value={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge value={p.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isOverdue(p.targetDate) &&
                          p.status !== 'COMPLETED' &&
                          p.status !== 'CANCELLED'
                            ? 'text-[var(--color-danger)]'
                            : 'text-[var(--color-muted-foreground)]'
                        }
                      >
                        {formatDate(p.targetDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {p._count?.tasks ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {formOpen && (
        <ProjectForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          defaultOrganizationId={filters.organizationId}
        />
      )}
    </div>
  );
}
