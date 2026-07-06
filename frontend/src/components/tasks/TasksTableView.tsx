import { CheckCircle2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PriorityBadge, TaskStatusBadge } from '@/components/badges';
import { LabelChips } from './LabelChips';
import { AssigneeAvatars } from './AssigneeAvatars';
import { formatDate, isOverdue } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';

interface Props {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onQuickStatus: (task: Task, status: Task['status']) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  // Oculta la columna Proyecto (útil dentro del detalle de un proyecto).
  hideProject?: boolean;
}

export function TasksTableView({
  tasks,
  onOpen,
  onQuickStatus,
  onEdit,
  onDelete,
  hideProject,
}: Props) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Tarea</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              {!hideProject && <th className="px-4 py-3 font-medium">Proyecto</th>}
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Prioridad</th>
              <th className="px-4 py-3 font-medium">Vence</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {tasks.map((task) => {
              const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';
              return (
                <tr key={task.id} className="hover:bg-[var(--color-muted)]/40">
                  <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
                    <button className="text-left hover:underline" onClick={() => onOpen(task)}>
                      {task.title}
                    </button>
                    {task.labels && task.labels.length > 0 && (
                      <div className="mt-1">
                        <LabelChips labels={task.labels.map((tl) => tl.label)} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {task.organization?.name ?? '—'}
                  </td>
                  {!hideProject && (
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {task.project?.name ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {task.assignees.length > 0 ? (
                      <AssigneeAvatars users={task.assignees.map((a) => a.user)} />
                    ) : (
                      '—'
                    )}
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
                      <Button size="sm" variant="ghost" title="Marcar Hecho" onClick={() => onQuickStatus(task, 'DONE')}>
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Volver a Por hacer" onClick={() => onQuickStatus(task, 'TODO')}>
                        <RotateCcw className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Editar" onClick={() => onEdit(task)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Eliminar" onClick={() => onDelete(task)}>
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
  );
}
