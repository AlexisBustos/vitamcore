import { CheckSquare, Pencil, Trash2 } from 'lucide-react';
import { PriorityBadge } from '@/components/badges';
import { Button } from '@/components/ui/button';
import { LabelChips } from '@/components/tasks/LabelChips';
import { AssigneeAvatars } from '@/components/tasks/AssigneeAvatars';
import { checklistProgress } from '@/components/tasks/checklistProgress';
import { formatDate, isOverdue } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, onOpen, onEdit, onDelete }: Props) {
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';
  const cl = checklistProgress(task.checklistItems);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onOpen(task)}
      className="cursor-grab rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm active:cursor-grabbing"
    >
      {task.labels && task.labels.length > 0 && (
        <div className="mb-2">
          <LabelChips labels={task.labels.map((tl) => tl.label)} />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-foreground)]">
          {task.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Editar"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Eliminar"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task);
            }}
          >
            <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PriorityBadge value={task.priority} />
        <div className="flex items-center gap-2">
          {cl.total > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
              <CheckSquare className="h-3.5 w-3.5" /> {cl.done}/{cl.total}
            </span>
          )}
          <span
            className={cn(
              'text-xs',
              overdue
                ? 'font-medium text-[var(--color-danger)]'
                : 'text-[var(--color-muted-foreground)]',
            )}
          >
            {formatDate(task.dueDate)}
          </span>
          <AssigneeAvatars users={task.assignees.map((a) => a.user)} />
        </div>
      </div>
    </div>
  );
}
