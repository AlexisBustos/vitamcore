import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useRulePreview, useSaveRule } from '@/hooks/useFinance';
import type { BankCategory } from '@/types/domain';

const DIRECTIONS = [
  { value: 'ANY', label: 'Cualquiera' },
  { value: 'CHARGE', label: 'Cargo' },
  { value: 'CREDIT', label: 'Abono' },
];

export function CreateRuleFromMovement({
  description,
  isCharge,
  pinned,
  categories,
}: {
  description: string;
  isCharge: boolean;
  pinned: boolean;
  categories: BankCategory[];
}) {
  const [open, setOpen] = useState(false);
  const [matchText, setMatchText] = useState(description);
  const [direction, setDirection] = useState(isCharge ? 'CHARGE' : 'ANY');
  const [categoryKey, setCategoryKey] = useState('');
  const preview = useRulePreview(matchText, direction);
  const saveRule = useSaveRule();

  const activeCats = categories.filter((c) => c.active);

  async function crear() {
    if (!categoryKey) return;
    await saveRule.mutateAsync({ categoryKey, matchText, direction });
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        title="Crear regla desde este movimiento"
        className="text-xs text-[var(--color-primary)] hover:underline"
        onClick={() => setOpen(true)}
      >
        + regla
      </button>
    );
  }

  return (
    <div className="absolute z-20 mt-1 w-80 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-lg">
      <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">
        Cuando la descripción <strong>contenga</strong>:
      </p>
      <Input value={matchText} onChange={(e) => setMatchText(e.target.value)} className="font-mono text-xs" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Select options={DIRECTIONS} value={direction} onChange={(e) => setDirection(e.target.value)} />
        <Select
          options={activeCats.map((c) => ({ value: c.key, label: c.name }))}
          placeholder="Categoría…"
          value={categoryKey}
          onChange={(e) => setCategoryKey(e.target.value)}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        Calza con ~{preview.data?.count ?? '…'} movimientos
      </p>
      {pinned && (
        <p className="mt-1 text-xs text-[var(--color-warning)]">
          Este movimiento está ajustado a mano; la regla no lo tocará.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button onClick={crear} disabled={!categoryKey || saveRule.isPending}>Crear regla</Button>
      </div>
    </div>
  );
}
