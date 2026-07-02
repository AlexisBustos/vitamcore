// Formulario genérico de libro (ingresos/gastos). Unifica IncomeForm y
// ExpenseForm: ambos son >90% idénticos, solo difieren en el campo de
// "parte" (cliente/proveedor), el campo de fecha, las opciones/estado por
// defecto, textos y el hook de guardado. Los wrappers `IncomeForm` y
// `ExpenseForm` instancian este componente con su configuración.
import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ContextFields, type ContextValue } from '@/components/ContextFields';
import { recurrenceOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import type { useSaveIncome, useSaveExpense } from '@/hooks/useFinance';
import type { IncomeRecord, ExpenseRecord } from '@/types/domain';

type LedgerRecord = IncomeRecord | ExpenseRecord;

export interface LedgerFormConfig {
  title: { create: string; edit: string };
  partyField: {
    key: 'clientName' | 'vendorName';
    label: string;
    value: string | null | undefined;
  };
  dateField: {
    key: 'incomeDate' | 'expenseDate';
    label: string;
    value: string | null | undefined;
  };
  statusOptions: { value: string; label: string }[];
  defaultStatus: string;
  categoryPlaceholder: string;
  recurringLabel: string;
  save: ReturnType<typeof useSaveIncome> | ReturnType<typeof useSaveExpense>;
}

interface LedgerFormProps {
  open: boolean;
  onClose: () => void;
  record?: LedgerRecord | null;
  defaultOrganizationId?: string;
  config: LedgerFormConfig;
}

const toDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

export function LedgerForm({
  open,
  onClose,
  record,
  defaultOrganizationId,
  config,
}: LedgerFormProps) {
  const editing = !!record;
  const save = config.save;
  const [error, setError] = useState<string | null>(null);

  const [ctx, setCtx] = useState<ContextValue>({
    organizationId: record?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: record?.businessUnitId ?? '',
    projectId: record?.projectId ?? '',
  });

  const [form, setForm] = useState({
    description: record?.description ?? '',
    partyName: config.partyField.value ?? '',
    amount: String(record?.amount ?? 0),
    category: record?.category ?? '',
    status: record?.status ?? config.defaultStatus,
    date: toDate(config.dateField.value),
    dueDate: toDate(record?.dueDate),
    isRecurring: record?.isRecurring ?? false,
    recurrenceFrequency: record?.recurrenceFrequency ?? '',
    notes: record?.notes ?? '',
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
      [config.partyField.key]: form.partyName || null,
      amount: Number(form.amount) || 0,
      category: form.category || null,
      status: form.status,
      [config.dateField.key]: form.date || null,
      dueDate: form.dueDate || null,
      isRecurring: form.isRecurring,
      recurrenceFrequency: form.isRecurring
        ? form.recurrenceFrequency || null
        : null,
      notes: form.notes || null,
    };
    try {
      await save.mutateAsync({
        id: record?.id,
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
      title={editing ? config.title.edit : config.title.create}
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
          <Field label={config.partyField.label}>
            <Input
              value={form.partyName}
              onChange={(e) => set('partyName', e.target.value)}
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
              placeholder={config.categoryPlaceholder}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado">
            <Select
              options={config.statusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
          <Field label={config.dateField.label}>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
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
            {config.recurringLabel}
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
