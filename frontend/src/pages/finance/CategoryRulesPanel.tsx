import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import {
  useBankCategories,
  useCategoryRules,
  useSaveCategory,
  useDeleteCategory,
  useSaveRule,
  useDeleteRule,
  useReorderRules,
  useReapplyRules,
} from '@/hooks/useFinance';

const KINDS = [
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'EXPENSE', label: 'Egreso' },
  { value: 'NEUTRAL', label: 'Neutro' },
];
const DIRECTIONS = [
  { value: 'ANY', label: 'Cualquiera' },
  { value: 'CHARGE', label: 'Cargo' },
  { value: 'CREDIT', label: 'Abono' },
];

export function CategoryRulesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useBankCategories();
  const rules = useCategoryRules();
  const saveCategory = useSaveCategory();
  const deleteCategory = useDeleteCategory();
  const saveRule = useSaveRule();
  const deleteRule = useDeleteRule();
  const reorderRules = useReorderRules();
  const reapply = useReapplyRules();

  const [newCat, setNewCat] = useState({ name: '', kind: 'EXPENSE' });
  const [newRule, setNewRule] = useState({ matchText: '', direction: 'ANY', categoryKey: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  const cats = categories.data ?? [];
  const ruleList = rules.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Categorías y reglas">
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="rounded-[var(--radius)] bg-[var(--color-success)]/10 px-3 py-2 text-sm text-[var(--color-success)]">
          {notice}
        </p>
      )}

      {/* CATEGORÍAS */}
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold">Categorías</h3>
        {categories.isLoading ? (
          <Spinner label="Cargando…" />
        ) : (
          <ul className="space-y-1">
            {cats.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{c.name}</span>
                <Select
                  className="h-8 w-28 text-xs"
                  options={KINDS}
                  value={c.kind}
                  onChange={(e) => run(() => saveCategory.mutateAsync({ key: c.key, name: c.name, kind: e.target.value }))}
                />
                <Button
                  variant="outline"
                  onClick={() => run(() => saveCategory.mutateAsync({ key: c.key, name: c.name, kind: c.kind, active: !c.active }))}
                >
                  {c.active ? 'Activa' : 'Inactiva'}
                </Button>
                <Button variant="outline" onClick={() => run(() => deleteCategory.mutateAsync(c.key))}>
                  Borrar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Input placeholder="Nueva categoría…" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <Select className="w-28" options={KINDS} value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value })} />
          <Button
            disabled={!newCat.name}
            onClick={() => run(async () => { await saveCategory.mutateAsync(newCat); setNewCat({ name: '', kind: 'EXPENSE' }); })}
          >
            Agregar
          </Button>
        </div>
      </section>

      {/* REGLAS */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Reglas (orden = prioridad)</h3>
          <Button variant="outline" onClick={() => run(async () => { const r = await reapply.mutateAsync(); setNotice(`Reaplicadas: ${(r as { data: { updated: number } }).data?.updated ?? 0} movimientos actualizados.`); })}>
            Reaplicar reglas ahora
          </Button>
        </div>
        {rules.isLoading ? (
          <Spinner label="Cargando…" />
        ) : (
          <ul className="space-y-1">
            {ruleList.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <div className="flex flex-col">
                  <button disabled={i === 0} title="Subir"
                    onClick={() => run(() => reorderRules.mutateAsync(swap(ruleList.map((x) => x.id), i, i - 1)))}>▲</button>
                  <button disabled={i === ruleList.length - 1} title="Bajar"
                    onClick={() => run(() => reorderRules.mutateAsync(swap(ruleList.map((x) => x.id), i, i + 1)))}>▼</button>
                </div>
                <span className="flex-1 font-mono text-xs">contiene “{r.matchText}”</span>
                <span className="w-20 text-xs text-[var(--color-muted-foreground)]">{r.direction}</span>
                <span className="w-40 text-xs">{cats.find((c) => c.key === r.categoryKey)?.name ?? r.categoryKey}</span>
                <Button variant="outline" onClick={() => run(() => saveRule.mutateAsync({ id: r.id, active: !r.active }))}>
                  {r.active ? 'Activa' : 'Inactiva'}
                </Button>
                <Button variant="outline" onClick={() => run(() => deleteRule.mutateAsync(r.id))}>Borrar</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
          <Input placeholder="texto a contener…" className="font-mono text-xs" value={newRule.matchText} onChange={(e) => setNewRule({ ...newRule, matchText: e.target.value })} />
          <Select className="w-28" options={DIRECTIONS} value={newRule.direction} onChange={(e) => setNewRule({ ...newRule, direction: e.target.value })} />
          <Select className="w-40" options={cats.filter((c) => c.active).map((c) => ({ value: c.key, label: c.name }))} placeholder="Categoría…" value={newRule.categoryKey} onChange={(e) => setNewRule({ ...newRule, categoryKey: e.target.value })} />
          <Button
            disabled={!newRule.matchText || !newRule.categoryKey}
            onClick={() => run(async () => { await saveRule.mutateAsync(newRule); setNewRule({ matchText: '', direction: 'ANY', categoryKey: '' }); })}
          >
            Agregar
          </Button>
        </div>
      </section>
    </Modal>
  );
}

function swap(ids: string[], i: number, j: number): string[] {
  const copy = [...ids];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
