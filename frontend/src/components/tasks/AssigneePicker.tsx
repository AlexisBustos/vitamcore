import { useAssignees } from '@/hooks/useAssignees';

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function AssigneePicker({ selected, onChange }: Props) {
  const { data: assignees } = useAssignees();

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {(assignees ?? []).map((u) => {
        const on = selected.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-foreground)] ring-2 ring-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-70'}`}
          >
            {u.name}
          </button>
        );
      })}
    </div>
  );
}
