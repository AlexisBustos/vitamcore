import { Pencil, Trash2 } from 'lucide-react';
import { PriorityBadge } from '@/components/badges';
import { Button } from '@/components/ui/button';
import { LabelChips } from '@/components/tasks/LabelChips';
import { formatDate, isOverdue } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

// Iniciales del responsable (máx. 2) para el avatar.
function initials(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function TaskCard({ task, onOpen, onEdit, onDelete }: Props) {
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';

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
          {task.owner?.name && (
            <span
              title={task.owner.name}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-muted)] text-[10px] font-semibold text-[var(--color-foreground)]"
            >
              {initials(task.owner.name)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
