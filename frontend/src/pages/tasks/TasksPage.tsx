import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PriorityBadge, TaskStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import {
  formatDate,
  isOverdue,
  priorityOptions,
  taskStatusOptions,
} from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useProjects } from '@/hooks/useProjects';
import {
  useTasks,
  useSaveTask,
  useDeleteTask,
  type TaskFilters,
} from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';
import { TaskForm } from './TaskForm';
import { TaskBoard } from './TaskBoard';

export function TasksPage() {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [taskForm, setTaskForm] = useState<{ open: boolean; task: Task | null }>(
    { open: false, task: null },
  );
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [newStatus, setNewStatus] = useState<Task['status']>('TODO');

  const { data: organizations } = useOrganizations();
  const { data: projects } = useProjects(
    filters.organizationId ? { organizationId: filters.organizationId } : {},
  );
  const { data, isLoading, isError, error } = useTasks(filters);
  const saveTask = useSaveTask();
  const deleteTask = useDeleteTask();

  const orgOptions = useMemo(
    () => (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );
  const projectOptions = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  function set(key: keyof TaskFilters, value: string) {
    setFilters((f) => {
      const next = { ...f, [key]: value || undefined };
      if (key === 'organizationId') next.projectId = undefined;
      return next;
    });
  }

  function quickStatus(task: Task, status: Task['status']) {
    saveTask.mutate({ id: task.id, data: { status } });
  }

  async function handleDelete(task: Task) {
    if (!confirm(`¿Eliminar la tarea "${task.title}"?`)) return;
    await deleteTask.mutateAsync(task.id);
  }

  function handleAddInColumn(status: Task['status']) {
    setNewStatus(status);
    setTaskForm({ open: true, task: null });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tareas"
        description="Tareas ejecutivas y operativas de todas las empresas."
        actions={
          <Button
            onClick={() => {
              setNewStatus('TODO');
              setTaskForm({ open: true, task: null });
            }}
          >
            <Plus className="h-4 w-4" /> Nueva tarea
          </Button>
        }
      />

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            options={orgOptions}
            placeholder="Todas las empresas"
            value={filters.organizationId ?? ''}
            onChange={(e) => set('organizationId', e.target.value)}
          />
          <Select
            options={projectOptions}
            placeholder="Todos los proyectos"
            value={filters.projectId ?? ''}
            onChange={(e) => set('projectId', e.target.value)}
            disabled={!filters.organizationId}
          />
          <Select
            options={taskStatusOptions}
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
          <Select
            options={[
              { value: '', label: 'Todas las fechas' },
              { value: 'true', label: 'Solo vencidas' },
            ]}
            value={filters.overdue ?? ''}
            onChange={(e) => set('overdue', e.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end gap-1">
          <Button
            size="sm"
            variant={view === 'table' ? 'primary' : 'outline'}
            onClick={() => setView('table')}
          >
            <TableIcon className="h-4 w-4" /> Tabla
          </Button>
          <Button
            size="sm"
            variant={view === 'kanban' ? 'primary' : 'outline'}
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="h-4 w-4" /> Kanban
          </Button>
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {view === 'table' && data && data.length === 0 && (
        <EmptyState title="Sin tareas">
          No hay tareas que coincidan con los filtros.
        </EmptyState>
      )}

      {view === 'table' && data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Tarea</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Proyecto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Prioridad</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((task) => {
                  const overdue =
                    isOverdue(task.dueDate) && task.status !== 'DONE';
                  return (
                    <tr key={task.id} className="hover:bg-[var(--color-muted)]/40">
                      <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
                        {task.title}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {task.organization?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {task.project?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <TaskStatusBadge value={task.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge value={task.priority} />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3',
                          overdue
                            ? 'font-medium text-[var(--color-danger)]'
                            : 'text-[var(--color-muted-foreground)]',
                        )}
                      >
                        {formatDate(task.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Marcar Hecho"
                            onClick={() => quickStatus(task, 'DONE')}
                          >
                            <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Volver a Por hacer"
                            onClick={() => quickStatus(task, 'TODO')}
                          >
                            <RotateCcw className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar"
                            onClick={() => setTaskForm({ open: true, task })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Eliminar"
                            onClick={() => handleDelete(task)}
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

      {view === 'kanban' &&
        (!filters.projectId ? (
          <EmptyState title="Selecciona un proyecto">
            El tablero Kanban se organiza por proyecto. Elige un proyecto en los
            filtros para ver su tablero.
          </EmptyState>
        ) : data ? (
          <TaskBoard
            tasks={data}
            onAdd={handleAddInColumn}
            onEditTask={(task) => setTaskForm({ open: true, task })}
            onDeleteTask={handleDelete}
          />
        ) : null)}

      {taskForm.open && (
        <TaskForm
          open={taskForm.open}
          onClose={() => setTaskForm({ open: false, task: null })}
          task={taskForm.task}
          defaultOrganizationId={filters.organizationId}
          defaultProjectId={filters.projectId}
          defaultStatus={!taskForm.task ? newStatus : undefined}
          lockContext={view === 'kanban' && !taskForm.task && !!filters.projectId}
        />
      )}
    </div>
  );
}
