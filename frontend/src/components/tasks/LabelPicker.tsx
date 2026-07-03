import { useState } from 'react';
import { useLabels, useSaveLabel } from '@/hooks/useLabels';
import { labelColorClass, labelColorOptions, type LabelColor } from '@/lib/labels';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Label } from '@/types/domain';

interface Props {
  organizationId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function LabelPicker({ organizationId, selected, onChange }: Props) {
  const { data: labels } = useLabels(organizationId);
  const save = useSaveLabel();
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  async function create() {
    if (!name.trim()) return;
    const res = await save.mutateAsync({ data: { organizationId, name: name.trim(), color } });
    const created = (res as { data: Label }).data;
    onChange([...selected, created.id]);
    setName('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(labels ?? []).map((l) => {
          const on = selected.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className={`rounded-full border px-2 py-0.5 text-xs ${labelColorClass[l.color as LabelColor] ?? labelColorClass.gray} ${on ? 'ring-2 ring-[var(--color-accent)]' : 'opacity-60'}`}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva etiqueta" />
        <Select options={labelColorOptions} value={color} onChange={(e) => setColor(e.target.value as LabelColor)} />
        <Button type="button" variant="outline" size="sm" onClick={create} disabled={save.isPending}>Crear</Button>
      </div>
    </div>
  );
}
