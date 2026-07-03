import { useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from '@/hooks/useChecklist';
import { checklistProgress } from './checklistProgress';
import type { ChecklistItem } from '@/types/domain';

export function ChecklistSection({ taskId, items }: { taskId: string; items: ChecklistItem[] }) {
  const add = useAddChecklistItem(taskId);
  const update = useUpdateChecklistItem(taskId);
  const remove = useDeleteChecklistItem(taskId);
  const [text, setText] = useState('');
  const { total, done, pct } = checklistProgress(items);

  function submit() {
    if (!text.trim()) return;
    add.mutate(text.trim());
    setText('');
  }

  function move(index: number, dir: -1 | 1) {
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    update.mutate({ itemId: item.id, data: { position: other.position } });
    update.mutate({ itemId: other.id, data: { position: item.position } });
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
        Checklist {total > 0 && `· ${done}/${total}`}
      </p>
      {total > 0 && (
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => update.mutate({ itemId: item.id, data: { done: e.target.checked } })}
            />
            <span className={`flex-1 text-sm ${item.done ? 'text-[var(--color-muted-foreground)] line-through' : ''}`}>
              {item.text}
            </span>
            <Button size="sm" variant="ghost" title="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Bajar" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Borrar" onClick={() => remove.mutate(item.id)}>
              <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Añadir ítem…"
        />
        <Button type="button" variant="outline" size="sm" onClick={submit} disabled={add.isPending}>
          Añadir
        </Button>
      </div>
    </div>
  );
}
