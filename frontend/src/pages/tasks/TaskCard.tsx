import { Pencil, Trash2 } from 'lucide-react';
import { PriorityBadge } from '@/components/badges';
import { Button } from '@/components/ui/button';
import { formatDate, isOverdue } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete }: Props) {
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="cursor-grab rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-foreground)]">
          {task.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Editar"
            onClick={() => onEdit(task)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Eliminar"
            onClick={() => onDelete(task)}
          >
            <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PriorityBadge value={task.priority} />
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
      </div>
    </div>
  );
}
