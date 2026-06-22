import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { entityStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSaveBusinessUnit } from '@/hooks/useBusinessUnits';
import type { BusinessUnit } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  unit?: BusinessUnit | null;
}

export function BusinessUnitForm({
  open,
  onClose,
  organizationId,
  unit,
}: Props) {
  const editing = !!unit;
  const save = useSaveBusinessUnit();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: unit?.name ?? '',
    description: unit?.description ?? '',
    status: unit?.status ?? 'ACTIVE',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({
        id: unit?.id,
        data: editing
          ? {
              name: form.name,
              description: form.description || null,
              status: form.status,
            }
          : {
              organizationId,
              name: form.name,
              description: form.description || null,
              status: form.status,
            },
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
      title={editing ? 'Editar unidad' : 'Nueva unidad de negocio'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre" required>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Estado">
          <Select
            options={entityStatusOptions}
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
          />
        </Field>
        <Field label="Descripción">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
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
