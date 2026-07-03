import { labelColorClass, type LabelColor } from '@/lib/labels';
import type { Label } from '@/types/domain';

export function LabelChips({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l.id}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${labelColorClass[l.color as LabelColor] ?? labelColorClass.gray}`}
        >
          {l.name}
        </span>
      ))}
    </div>
  );
}
