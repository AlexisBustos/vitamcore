import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAddComment } from '@/hooks/useComments';
import { activityText } from '@/lib/taskActivity';
import { formatDate } from '@/lib/domain';
import type { TaskComment, TaskActivity } from '@/types/domain';

type Entry =
  | { kind: 'comment'; at: string; c: TaskComment }
  | { kind: 'activity'; at: string; a: TaskActivity };

export function ActivityFeed({
  taskId,
  comments,
  activity,
}: {
  taskId: string;
  comments: TaskComment[];
  activity: TaskActivity[];
}) {
  const add = useAddComment(taskId);
  const [body, setBody] = useState('');

  const entries: Entry[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })),
    ...activity.map((a) => ({ kind: 'activity' as const, at: a.createdAt, a })),
  ].sort((x, y) => (x.at < y.at ? 1 : -1));

  function submit() {
    if (!body.trim()) return;
    add.mutate(body.trim());
    setBody('');
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
        Actividad y comentarios
      </p>
      <div className="mb-3 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe un comentario…"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={submit}
            disabled={add.isPending}
          >
            Comentar
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {entries.map((e) =>
          e.kind === 'comment' ? (
            <li
              key={`c-${e.c.id}`}
              className="rounded-md bg-[var(--color-muted)]/40 p-2 text-sm"
            >
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {e.c.author?.name ?? 'Alguien'} · {formatDate(e.c.createdAt)}
              </p>
              <p className="whitespace-pre-line text-[var(--color-foreground)]">
                {e.c.body}
              </p>
            </li>
          ) : (
            <li
              key={`a-${e.a.id}`}
              className="px-2 text-xs text-[var(--color-muted-foreground)]"
            >
              • {e.a.actor?.name ?? 'IA'} {activityText(e.a)} ·{' '}
              {formatDate(e.a.createdAt)}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
