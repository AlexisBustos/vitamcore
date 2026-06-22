import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ContextFields, type ContextValue } from '@/components/ContextFields';
import { incomeStatusOptions, recurrenceOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSaveIncome } from '@/hooks/useFinance';
import type { IncomeRecord } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  income?: IncomeRecord | null;
  defaultOrganizationId?: string;
}

const toDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

export function IncomeForm({ open, onClose, income, defaultOrganizationId }: Props) {
  const editing = !!income;
  const save = useSaveIncome();
  const [error, setError] = useState<string | null>(null);

  const [ctx, setCtx] = useState<ContextValue>({
    organizationId: income?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: income?.businessUnitId ?? '',
    projectId: income?.projectId ?? '',
  });

  const [form, setForm] = useState({
    description: income?.description ?? '',
    clientName: income?.clientName ?? '',
    amount: String(income?.amount ?? 0),
    category: income?.category ?? '',
    status: income?.status ?? 'EXPECTED',
    incomeDate: toDate(income?.incomeDate),
    dueDate: toDate(income?.dueDate),
    isRecurring: income?.isRecurring ?? false,
    recurrenceFrequency: income?.recurrenceFrequency ?? '',
    notes: income?.notes ?? '',
  });

  function set<K extends keyof typeof form>(key: K, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      businessUnitId: ctx.businessUnitId || null,
      projectId: ctx.projectId || null,
      description: form.description,
      clientName: form.clientName || null,
      amount: Number(form.amount) || 0,
      category: form.category || null,
      status: form.status,
      incomeDate: form.incomeDate || null,
      dueDate: form.dueDate || null,
      isRecurring: form.isRecurring,
      recurrenceFrequency: form.isRecurring
        ? form.recurrenceFrequency || null
        : null,
      notes: form.notes || null,
    };
    try {
      await save.mutateAsync({
        id: income?.id,
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
      title={editing ? 'Editar ingreso' : 'Nuevo ingreso'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ContextFields
          value={ctx}
          onChange={(p) => setCtx((c) => ({ ...c, ...p }))}
          lockOrganization={editing}
        />

        <Field label="Descripción" required>
          <Input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cliente">
            <Input
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
            />
          </Field>
          <Field label="Monto (CLP)">
            <Input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </Field>
          <Field label="Categoría">
            <Input
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              placeholder="Ej: Consulta médica"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado">
            <Select
              options={incomeStatusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
          <Field label="Fecha de ingreso">
            <Input
              type="date"
              value={form.incomeDate}
              onChange={(e) => set('incomeDate', e.target.value)}
            />
          </Field>
          <Field label="Vencimiento">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => set('isRecurring', e.target.checked)}
            />
            Ingreso recurrente
          </label>
          {form.isRecurring && (
            <Select
              options={recurrenceOptions}
              placeholder="Frecuencia"
              value={form.recurrenceFrequency}
              onChange={(e) => set('recurrenceFrequency', e.target.value)}
            />
          )}
        </div>

        <Field label="Notas">
          <Textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
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
