import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ContextFields, type ContextValue } from '@/components/ContextFields';
import { salesSourceOptions, salesStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSaveSale } from '@/hooks/useSales';
import type { SalesOpportunity } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  opportunity?: SalesOpportunity | null;
  defaultOrganizationId?: string;
}

const toDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

export function SalesForm({
  open,
  onClose,
  opportunity,
  defaultOrganizationId,
}: Props) {
  const editing = !!opportunity;
  const save = useSaveSale();
  const [error, setError] = useState<string | null>(null);

  const [ctx, setCtx] = useState<ContextValue>({
    organizationId: opportunity?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: opportunity?.businessUnitId ?? '',
    projectId: opportunity?.projectId ?? '',
  });

  const [form, setForm] = useState({
    clientName: opportunity?.clientName ?? '',
    opportunityName: opportunity?.opportunityName ?? '',
    productOrService: opportunity?.productOrService ?? '',
    estimatedAmount: String(opportunity?.estimatedAmount ?? 0),
    probability: String(opportunity?.probability ?? 0),
    status: opportunity?.status ?? 'LEAD',
    source: opportunity?.source ?? 'MANUAL',
    contactName: opportunity?.contactName ?? '',
    contactEmail: opportunity?.contactEmail ?? '',
    contactPhone: opportunity?.contactPhone ?? '',
    expectedCloseDate: toDate(opportunity?.expectedCloseDate),
    nextAction: opportunity?.nextAction ?? '',
    nextFollowUpDate: toDate(opportunity?.nextFollowUpDate),
    notes: opportunity?.notes ?? '',
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
      clientName: form.clientName,
      opportunityName: form.opportunityName,
      productOrService: form.productOrService || null,
      estimatedAmount: Number(form.estimatedAmount) || 0,
      probability: Number(form.probability) || 0,
      status: form.status,
      source: form.source,
      contactName: form.contactName || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      expectedCloseDate: form.expectedCloseDate || null,
      nextAction: form.nextAction || null,
      nextFollowUpDate: form.nextFollowUpDate || null,
      notes: form.notes || null,
    };
    try {
      await save.mutateAsync({
        id: opportunity?.id,
        data: editing
          ? base
          : { ...base, organizationId: ctx.organizationId },
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
      title={editing ? 'Editar oportunidad' : 'Nueva oportunidad'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ContextFields
          value={ctx}
          onChange={(p) => setCtx((c) => ({ ...c, ...p }))}
          lockOrganization={editing}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" required>
            <Input
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
              required
            />
          </Field>
          <Field label="Nombre de la oportunidad" required>
            <Input
              value={form.opportunityName}
              onChange={(e) => set('opportunityName', e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Producto / servicio">
            <Input
              value={form.productOrService}
              onChange={(e) => set('productOrService', e.target.value)}
            />
          </Field>
          <Field label="Monto estimado (CLP)">
            <Input
              type="number"
              min={0}
              value={form.estimatedAmount}
              onChange={(e) => set('estimatedAmount', e.target.value)}
            />
          </Field>
          <Field label="Probabilidad (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => set('probability', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado">
            <Select
              options={salesStatusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
          <Field label="Origen">
            <Select
              options={salesSourceOptions}
              value={form.source}
              onChange={(e) => set('source', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contacto">
            <Input
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
            />
          </Field>
          <Field label="Email contacto">
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </Field>
          <Field label="Teléfono contacto">
            <Input
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cierre estimado">
            <Input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => set('expectedCloseDate', e.target.value)}
            />
          </Field>
          <Field label="Próximo seguimiento">
            <Input
              type="date"
              value={form.nextFollowUpDate}
              onChange={(e) => set('nextFollowUpDate', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Próxima acción">
          <Input
            value={form.nextAction}
            onChange={(e) => set('nextAction', e.target.value)}
          />
        </Field>
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
