import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { priorityOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useSaveProposedTask } from '@/hooks/useAgent';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultOrganizationId?: string | null;
  defaultRationale?: string;
}

export function ProposeTaskModal({
  open,
  onClose,
  defaultOrganizationId,
  defaultRationale,
}: Props) {
  const { data: organizations } = useOrganizations();
  const save = useSaveProposedTask();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    organizationId: defaultOrganizationId ?? '',
    title: '',
    priority: 'MEDIUM',
    rationale:
      defaultRationale ?? 'Sugerida a partir del análisis del agente ejecutivo.',
  });

  const orgOptions = useMemo(
    () => (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({
        organizationId: form.organizationId,
        title: form.title,
        priority: form.priority,
        rationale: form.rationale || null,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Proponer tarea">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-md bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          La tarea queda como <strong>propuesta</strong>. No se crea como tarea
          real hasta que la apruebes o conviertas en el panel de tareas propuestas.
        </p>
        <Field label="Empresa" required>
          <Select
            options={orgOptions}
            placeholder="Selecciona empresa"
            value={form.organizationId}
            onChange={(e) => set('organizationId', e.target.value)}
            required
          />
        </Field>
        <Field label="Título" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Prioridad">
          <Select
            options={priorityOptions}
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
          />
        </Field>
        <Field label="Justificación">
          <Textarea
            value={form.rationale}
            onChange={(e) => set('rationale', e.target.value)}
          />
        </Field>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Proponer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
