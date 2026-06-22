import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ContextFields, type ContextValue } from '@/components/ContextFields';
import { decisionStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSaveDecision } from '@/hooks/useDecisions';
import type { StrategicDecision } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  decision?: StrategicDecision | null;
  defaultOrganizationId?: string;
}

const toDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

export function DecisionForm({
  open,
  onClose,
  decision,
  defaultOrganizationId,
}: Props) {
  const editing = !!decision;
  const save = useSaveDecision();
  const [error, setError] = useState<string | null>(null);

  const [ctx, setCtx] = useState<ContextValue>({
    organizationId: decision?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: decision?.businessUnitId ?? '',
    projectId: decision?.projectId ?? '',
  });

  const [form, setForm] = useState({
    title: decision?.title ?? '',
    decision: decision?.decision ?? '',
    context: decision?.context ?? '',
    rationale: decision?.rationale ?? '',
    risks: decision?.risks ?? '',
    nextStep: decision?.nextStep ?? '',
    decisionDate: toDate(decision?.decisionDate),
    status: decision?.status ?? 'DRAFT',
    notes: decision?.notes ?? '',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      businessUnitId: ctx.businessUnitId || null,
      projectId: ctx.projectId || null,
      title: form.title,
      decision: form.decision,
      context: form.context || null,
      rationale: form.rationale || null,
      risks: form.risks || null,
      nextStep: form.nextStep || null,
      decisionDate: form.decisionDate || null,
      status: form.status,
      notes: form.notes || null,
    };
    try {
      await save.mutateAsync({
        id: decision?.id,
        data: editing ? base : { ...base, organizationId: ctx.organizationId },
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar decisión' : 'Nueva decisión'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ContextFields
          value={ctx}
          onChange={(p) => setCtx((c) => ({ ...c, ...p }))}
          lockOrganization={editing}
        />

        <Field label="Título" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
          />
        </Field>

        <Field label="Decisión" required>
          <Textarea
            value={form.decision}
            onChange={(e) => set('decision', e.target.value)}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado">
            <Select
              options={decisionStatusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
          <Field label="Fecha de la decisión">
            <Input
              type="date"
              value={form.decisionDate}
              onChange={(e) => set('decisionDate', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Contexto">
          <Textarea
            value={form.context}
            onChange={(e) => set('context', e.target.value)}
          />
        </Field>
        <Field label="Fundamento">
          <Textarea
            value={form.rationale}
            onChange={(e) => set('rationale', e.target.value)}
          />
        </Field>
        <Field label="Riesgos">
          <Textarea
            value={form.risks}
            onChange={(e) => set('risks', e.target.value)}
          />
        </Field>
        <Field label="Próximo paso">
          <Input
            value={form.nextStep}
            onChange={(e) => set('nextStep', e.target.value)}
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
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
