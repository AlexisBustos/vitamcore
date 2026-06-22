import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task, TaskStatus } from '@/types/domain';
import { TaskCard } from './TaskCard';

interface Props {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onDropTask: (taskId: string, status: TaskStatus) => void;
  onAdd: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function BoardColumn({
  status,
  title,
  tasks,
  onDropTask,
  onAdd,
  onEditTask,
  onDeleteTask,
}: Props) {
  const [over, setOver] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!over) setOver(true);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) onDropTask(taskId, status);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={[
        'flex w-full flex-col gap-3 rounded-[var(--radius)] border p-3 transition-colors',
        over
          ? 'border-[var(--color-accent)] bg-[var(--color-muted)]/60'
          : 'border-[var(--color-border)] bg-[var(--color-muted)]/30',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          {title}{' '}
          <span className="text-[var(--color-muted-foreground)]">
            ({tasks.length})
          </span>
        </h3>
        <Button
          size="sm"
          variant="ghost"
          title="Nueva tarea en esta columna"
          onClick={() => onAdd(status)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
            Arrastra tareas aquí
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
