import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, Plus, Table as TableIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { priorityOptions, taskStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useProjects } from '@/hooks/useProjects';
import {
  useTasks,
  useSaveTask,
  useDeleteTask,
  type TaskFilters,
} from '@/hooks/useTasks';
import { useAuth } from '@/context/AuthContext';
import type { Task } from '@/types/domain';
import { TaskForm } from './TaskForm';
import { TaskBoard } from './TaskBoard';
import { TasksTableView } from '@/components/tasks/TasksTableView';
import { TaskPanel } from '@/components/tasks/TaskPanel';

export function TasksPage() {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [taskForm, setTaskForm] = useState<{ open: boolean; task: Task | null }>(
    { open: false, task: null },
  );
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [newStatus, setNewStatus] = useState<Task['status']>('TODO');
  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskId = searchParams.get('tarea');

  const { user } = useAuth();
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

  function openTask(id: string) {
    setSearchParams((p) => {
      p.set('tarea', id);
      return p;
    });
  }
  function closeTask() {
    setSearchParams((p) => {
      p.delete('tarea');
      return p;
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            placeholder="Buscar tareas…"
            value={filters.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
          />
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
            variant={filters.ownerId ? 'primary' : 'outline'}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                ownerId: f.ownerId ? undefined : user?.id,
              }))
            }
            className="mr-auto"
          >
            Mis tareas
          </Button>
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
        <TasksTableView
          tasks={data}
          onOpen={(t) => openTask(t.id)}
          onQuickStatus={quickStatus}
          onEdit={(task) => setTaskForm({ open: true, task })}
          onDelete={handleDelete}
        />
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
            onOpenTask={(t) => openTask(t.id)}
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

      <TaskPanel taskId={openTaskId} onClose={closeTask} />
    </div>
  );
}
