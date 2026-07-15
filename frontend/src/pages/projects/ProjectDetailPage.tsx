import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Pencil, Plus, Table as TableIcon, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriorityBadge, ProjectStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useProject, useDeleteProject } from '@/hooks/useProjects';
import { useTasks, useSaveTask, useDeleteTask } from '@/hooks/useTasks';
import type { Task } from '@/types/domain';
import { TaskForm } from '@/pages/tasks/TaskForm';
import { TaskBoard } from '@/pages/tasks/TaskBoard';
import { TasksTableView } from '@/components/tasks/TasksTableView';
import { TaskPanel } from '@/components/tasks/TaskPanel';
import { ProjectForm } from './ProjectForm';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError, error } = useProject(id);
  const deleteProject = useDeleteProject();
  const saveTask = useSaveTask();
  const deleteTask = useDeleteTask();

  const [editOpen, setEditOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<{ open: boolean; task: Task | null }>(
    { open: false, task: null },
  );
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskId = searchParams.get('tarea');

  // Tareas del proyecto (con búsqueda), acotadas por projectId.
  const { data: tasks } = useTasks({ projectId: id, search: search || undefined });

  if (isLoading) return <Spinner />;
  if (isError || !project)
    return <ErrorState message={getErrorMessage(error)} />;

  function openTask(t: Task) {
    setSearchParams((p) => {
      p.set('tarea', t.id);
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
  async function handleDeleteTask(task: Task) {
    if (!confirm(`¿Eliminar la tarea "${task.title}"?`)) return;
    await deleteTask.mutateAsync(task.id);
  }

  async function handleDelete() {
    if (!project) return;
    if (!confirm(`¿Eliminar el proyecto "${project.name}"? Las tareas quedarán sin proyecto.`))
      return;
    await deleteProject.mutateAsync(project.id);
    navigate('/proyectos');
  }

  // El avance se calcula con las tareas embebidas del proyecto (siempre completas).
  const doneTasks = project.tasks.filter((t) => t.status === 'DONE').length;
  const totalTasks = project.tasks.length;
  const progress = totalTasks
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;

  const info: { label: string; value: string }[] = [
    { label: 'Empresa', value: project.organization?.name ?? '—' },
    { label: 'Unidad', value: project.businessUnit?.name ?? '—' },
    { label: 'Responsable', value: project.owner?.name ?? '—' },
    {
      label: 'Visibilidad',
      value:
        project.members && project.members.length > 0
          ? project.members.map((m) => m.user.name).join(', ')
          : 'Todos',
    },
    { label: 'Inicio', value: formatDate(project.startDate) },
    { label: 'Objetivo', value: formatDate(project.targetDate) },
  ];

  const projectTasks = tasks ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/proyectos"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Proyectos
      </Link>

      <PageHeader
        title={project.name}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button variant="ghost" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <ProjectStatusBadge value={project.status} />
        <PriorityBadge value={project.priority} />
      </div>

      {/* Avance del proyecto según tareas completadas */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[var(--color-foreground)]">
              Avance
            </span>
            <span className="text-[var(--color-muted-foreground)]">
              {totalTasks === 0
                ? 'Sin tareas'
                : `${doneTasks}/${totalTasks} tareas · ${progress}%`}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
          {info.map((i) => (
            <div key={i.label}>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {i.label}
              </p>
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                {i.value}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {(project.nextAction || project.risks || project.description) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {project.nextAction && (
            <DetailBlock title="Próxima acción">
              {project.nextAction}
            </DetailBlock>
          )}
          {project.risks && (
            <DetailBlock title="Riesgos">{project.risks}</DetailBlock>
          )}
          {project.description && (
            <DetailBlock title="Descripción">
              {project.description}
            </DetailBlock>
          )}
        </div>
      )}

      {/* Tareas del proyecto: búsqueda + lista/tablero + panel */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Tareas</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-40"
            />
            <Button
              size="sm"
              variant={view === 'table' ? 'primary' : 'outline'}
              onClick={() => setView('table')}
            >
              <TableIcon className="h-4 w-4" /> Lista
            </Button>
            <Button
              size="sm"
              variant={view === 'kanban' ? 'primary' : 'outline'}
              onClick={() => setView('kanban')}
            >
              <LayoutGrid className="h-4 w-4" /> Tablero
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTaskForm({ open: true, task: null })}
            >
              <Plus className="h-4 w-4" /> Nueva tarea
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {projectTasks.length === 0 ? (
            <EmptyState title="Sin tareas">
              {search
                ? 'No hay tareas que coincidan con la búsqueda.'
                : 'Agrega la primera tarea de este proyecto.'}
            </EmptyState>
          ) : view === 'table' ? (
            <TasksTableView
              tasks={projectTasks}
              onOpen={openTask}
              onQuickStatus={quickStatus}
              onEdit={(task) => setTaskForm({ open: true, task })}
              onDelete={handleDeleteTask}
              hideProject
            />
          ) : (
            <TaskBoard
              tasks={projectTasks}
              onAdd={() => setTaskForm({ open: true, task: null })}
              onOpenTask={openTask}
              onEditTask={(task) => setTaskForm({ open: true, task })}
              onDeleteTask={handleDeleteTask}
            />
          )}
        </CardContent>
      </Card>

      {editOpen && (
        <ProjectForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          project={project}
        />
      )}
      {taskForm.open && (
        <TaskForm
          open={taskForm.open}
          onClose={() => setTaskForm({ open: false, task: null })}
          task={taskForm.task}
          defaultOrganizationId={project.organizationId}
          defaultProjectId={project.id}
          lockContext={!taskForm.task}
        />
      )}

      <TaskPanel taskId={openTaskId} onClose={closeTask} />
    </div>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-line text-sm text-[var(--color-foreground)]">
          {children}
        </p>
      </CardContent>
    </Card>
  );
}
