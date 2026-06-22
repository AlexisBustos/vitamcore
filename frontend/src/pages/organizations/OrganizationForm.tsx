import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  entityStatusOptions,
  organizationTypeOptions,
} from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSaveOrganization } from '@/hooks/useOrganizations';
import type { Organization } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  organization?: Organization | null;
}

export function OrganizationForm({ open, onClose, organization }: Props) {
  const editing = !!organization;
  const save = useSaveOrganization();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: organization?.name ?? '',
    description: organization?.description ?? '',
    type: organization?.type ?? 'HEALTHCARE',
    status: organization?.status ?? 'ACTIVE',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({
        id: organization?.id,
        data: {
          name: form.name,
          description: form.description || null,
          type: form.type,
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
      title={editing ? 'Editar empresa' : 'Nueva empresa'}
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo" required>
            <Select
              options={organizationTypeOptions}
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            />
          </Field>
          <Field label="Estado">
            <Select
              options={entityStatusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
        </div>
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
