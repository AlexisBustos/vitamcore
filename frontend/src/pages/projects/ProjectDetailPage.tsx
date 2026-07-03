import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PriorityBadge,
  ProjectStatusBadge,
  TaskStatusBadge,
} from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, isOverdue } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useProject, useDeleteProject } from '@/hooks/useProjects';
import type { Task } from '@/types/domain';
import { TaskForm } from '@/pages/tasks/TaskForm';
import { ProjectForm } from './ProjectForm';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError, error } = useProject(id);
  const deleteProject = useDeleteProject();

  const [editOpen, setEditOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<{ open: boolean; task: Task | null }>(
    { open: false, task: null },
  );

  if (isLoading) return <Spinner />;
  if (isError || !project)
    return <ErrorState message={getErrorMessage(error)} />;

  async function handleDelete() {
    if (!project) return;
    if (!confirm(`¿Eliminar el proyecto "${project.name}"? Las tareas quedarán sin proyecto.`))
      return;
    await deleteProject.mutateAsync(project.id);
    navigate('/proyectos');
  }

  const doneTasks = project.tasks.filter((t) => t.status === 'DONE').length;
  const totalTasks = project.tasks.length;
  const progress = totalTasks
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;

  const info: { label: string; value: string }[] = [
    { label: 'Empresa', value: project.organization?.name ?? '—' },
    { label: 'Unidad', value: project.businessUnit?.name ?? '—' },
    { label: 'Responsable', value: project.owner?.name ?? '—' },
    { label: 'Inicio', value: formatDate(project.startDate) },
    { label: 'Objetivo', value: formatDate(project.targetDate) },
  ];

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

      {/* Tareas del proyecto */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tareas ({project.tasks.length})</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTaskForm({ open: true, task: null })}
          >
            <Plus className="h-4 w-4" /> Nueva tarea
          </Button>
        </CardHeader>
        <CardContent>
          {project.tasks.length === 0 ? (
            <EmptyState title="Sin tareas">
              Agrega la primera tarea de este proyecto.
            </EmptyState>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {project.tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setTaskForm({ open: true, task })}
                  className="flex w-full items-center justify-between py-3 text-left hover:opacity-80"
                >
                  <div>
                    <p className="font-medium text-[var(--color-foreground)]">
                      {task.title}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Vence:{' '}
                      <span
                        className={
                          isOverdue(task.dueDate) && task.status !== 'DONE'
                            ? 'text-[var(--color-danger)]'
                            : ''
                        }
                      >
                        {formatDate(task.dueDate)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge value={task.priority} />
                    <TaskStatusBadge value={task.status} />
                  </div>
                </button>
              ))}
            </div>
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
