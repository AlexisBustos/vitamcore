import type { Ref } from '@/types/domain';

// Iniciales (máx. 2) para el avatar.
function initials(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface Props {
  users: Ref[];
  max?: number;
}

export function AssigneeAvatars({ users, max = 3 }: Props) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <span
          key={u.id}
          title={u.name}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-card)] bg-[var(--color-muted)] text-[10px] font-semibold text-[var(--color-foreground)]"
        >
          {initials(u.name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={users.slice(max).map((u) => u.name).join(', ')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-card)] bg-[var(--color-muted)] text-[10px] font-semibold text-[var(--color-muted-foreground)]"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
