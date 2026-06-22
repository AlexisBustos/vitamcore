import { useMemo } from 'react';
import { useMoveTask } from '@/hooks/useTasks';
import type { Task, TaskStatus } from '@/types/domain';
import { BoardColumn } from './BoardColumn';

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'TODO', title: 'Por hacer' },
  { status: 'DOING', title: 'Haciendo' },
  { status: 'DONE', title: 'Hecho' },
];

interface Props {
  tasks: Task[];
  onAdd: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function TaskBoard({ tasks, onAdd, onEditTask, onDeleteTask }: Props) {
  const moveTask = useMoveTask();

  const byStatus = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = { TODO: [], DOING: [], DONE: [] };
    for (const task of tasks) groups[task.status].push(task);
    return groups;
  }, [tasks]);

  function handleDrop(taskId: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === taskId);
    // No-op si la tarjeta se suelta en su propia columna.
    if (!task || task.status === status) return;
    moveTask.mutate({ id: taskId, status });
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <BoardColumn
          key={col.status}
          status={col.status}
          title={col.title}
          tasks={byStatus[col.status]}
          onDropTask={handleDrop}
          onAdd={onAdd}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
        />
      ))}
    </div>
  );
}
