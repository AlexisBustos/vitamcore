import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  useProjects,
  useDeleteProject,
  type ProjectFilters,
} from '@/hooks/useProjects';
import type { Priority, Project } from '@/types/domain';
import { ProjectForm } from './ProjectForm';

// Estados que cuentan como "cerrados" (no se consideran vencidos ni activos).
const CLOSED: Project['status'][] = ['COMPLETED', 'CANCELLED'];

// Peso de prioridad para ordenar (CRITICAL primero).
const PRIORITY_WEIGHT: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

type SortKey = 'name' | 'status' | 'priority' | 'targetDate' | 'progress';
type SortDir = 'asc' | 'desc';

function progressPct(p: Project): number {
  const total = p.taskStats?.total ?? 0;
  if (total === 0) return -1; // sin tareas → al final al ordenar por avance
  return Math.round(((p.taskStats?.done ?? 0) / total) * 100);
}

export function ProjectsPage() {
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'targetDate',
    dir: 'asc',
  });
  const [form, setForm] = useState<{ open: boolean; project: Project | null }>({
    open: false,
    project: null,
  });

  const { data: organizations } = useOrganizations();
  const { data: units } = useBusinessUnits(
    filters.organizationId ? { organizationId: filters.organizationId } : {},
  );
  const { data, isLoading, isError, error } = useProjects(filters);
  const deleteProject = useDeleteProject();

  const orgOptions = useMemo(
    () => (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );
  const unitOptions = useMemo(
    () => (units ?? []).map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  // Resumen de cartera sobre los proyectos cargados (tras filtros de la API).
  const summary = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      inProgress: list.filter((p) => p.status === 'IN_PROGRESS').length,
      blocked: list.filter((p) => p.status === 'BLOCKED').length,
      overdue: list.filter(
        (p) => isOverdue(p.targetDate) && !CLOSED.includes(p.status),
      ).length,
      completed: list.filter((p) => p.status === 'COMPLETED').length,
    };
  }, [data]);

  // Búsqueda local (nombre, responsable, próxima acción) + ordenamiento.
  const rows = useMemo(() => {
    let list = data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.owner?.name ?? '').toLowerCase().includes(q) ||
          (p.nextAction ?? '').toLowerCase().includes(q),
      );
    }
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * factor;
        case 'status':
          return a.status.localeCompare(b.status) * factor;
        case 'priority':
          return (
            (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) * factor
          );
        case 'progress':
          return (progressPct(a) - progressPct(b)) * factor;
        case 'targetDate': {
          // Sin fecha al final, independientemente de la dirección.
          const av = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
          const bv = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
          if (av === bv) return 0;
          if (av === Infinity) return 1;
          if (bv === Infinity) return -1;
          return (av - bv) * factor;
        }
        default:
          return 0;
      }
    });
  }, [data, search, sort]);

  function set(key: keyof ProjectFilters, value: string) {
    setFilters((f) => {
      const next = { ...f, [key]: value || undefined };
      if (key === 'organizationId') next.businessUnitId = undefined;
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }

  async function handleDelete(project: Project) {
    if (
      !confirm(
        `¿Eliminar el proyecto "${project.name}"? Las tareas quedarán sin proyecto.`,
      )
    )
      return;
    await deleteProject.mutateAsync(project.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyectos"
        description="Cartera de proyectos de todas las empresas."
        actions={
          <Button onClick={() => setForm({ open: true, project: null })}>
            <Plus className="h-4 w-4" /> Nuevo proyecto
          </Button>
        }
      />

      {/* Resumen de cartera */}
      {data && data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Proyectos" value={summary.total} />
          <SummaryCard label="En curso" value={summary.inProgress} tone="blue" />
          <SummaryCard label="Bloqueados" value={summary.blocked} tone="red" />
          <SummaryCard label="Vencidos" value={summary.overdue} tone="red" />
          <SummaryCard
            label="Completados"
            value={summary.completed}
            tone="green"
          />
        </div>
      )}

      {/* Filtros + buscador */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input
              className="pl-8"
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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

      {data && rows.length === 0 && (
        <EmptyState title="Sin proyectos">
          {search || Object.keys(filters).length > 0
            ? 'No hay proyectos que coincidan con la búsqueda o los filtros.'
            : 'Aún no hay proyectos. Crea el primero con “Nuevo proyecto”.'}
        </EmptyState>
      )}

      {data && rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <SortableTh
                    label="Proyecto"
                    col="name"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Responsable</th>
                  <SortableTh
                    label="Estado"
                    col="status"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Prioridad"
                    col="priority"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Avance"
                    col="progress"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Objetivo"
                    col="targetDate"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((p) => {
                  const overdue =
                    isOverdue(p.targetDate) && !CLOSED.includes(p.status);
                  return (
                    <tr key={p.id} className="hover:bg-[var(--color-muted)]/40">
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
                        {p.businessUnit?.name && (
                          <span className="block text-xs">
                            {p.businessUnit.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {p.owner?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ProjectStatusBadge value={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge value={p.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <ProgressCell project={p} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            overdue
                              ? 'text-[var(--color-danger)]'
                              : 'text-[var(--color-muted-foreground)]'
                          }
                        >
                          {formatDate(p.targetDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar"
                            onClick={() =>
                              setForm({ open: true, project: p })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Eliminar"
                            disabled={deleteProject.isPending}
                            onClick={() => handleDelete(p)}
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
        <ProjectForm
          open={form.open}
          onClose={() => setForm({ open: false, project: null })}
          project={form.project}
          defaultOrganizationId={filters.organizationId}
        />
      )}
    </div>
  );
}

// --- Subcomponentes ---

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'blue' | 'red' | 'green';
}) {
  const toneClass = {
    default: 'text-[var(--color-foreground)]',
    blue: 'text-blue-600',
    red: value > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-foreground)]',
    green: 'text-emerald-600',
  }[tone];
  return (
    <Card className="p-4">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </Card>
  );
}

function ProgressCell({ project }: { project: Project }) {
  const total = project.taskStats?.total ?? 0;
  const done = project.taskStats?.done ?? 0;
  if (total === 0) {
    return (
      <span className="text-xs text-[var(--color-muted-foreground)]">
        Sin tareas
      </span>
    );
  }
  const pct = Math.round((done / total) * 100);
  return (
    <div className="min-w-[7rem]">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
        <span>
          {done}/{total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SortableTh({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === col;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-foreground)] ${
          active ? 'text-[var(--color-foreground)]' : ''
        }`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}
