import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { priorityOptions, projectStatusOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useBusinessUnits } from '@/hooks/useBusinessUnits';
import { useSaveProject } from '@/hooks/useProjects';
import type { Project } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  defaultOrganizationId?: string;
}

// Recorta una fecha ISO a YYYY-MM-DD para <input type="date">.
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function ProjectForm({
  open,
  onClose,
  project,
  defaultOrganizationId,
}: Props) {
  const editing = !!project;
  const save = useSaveProject();
  const { data: organizations } = useOrganizations();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    organizationId: project?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: project?.businessUnitId ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'IDEA',
    priority: project?.priority ?? 'MEDIUM',
    owner: project?.owner ?? '',
    nextAction: project?.nextAction ?? '',
    risks: project?.risks ?? '',
    startDate: toDateInput(project?.startDate),
    targetDate: toDateInput(project?.targetDate),
  });

  // Unidades de la empresa seleccionada.
  const { data: units } = useBusinessUnits(
    form.organizationId ? { organizationId: form.organizationId } : {},
  );

  const orgOptions = useMemo(
    () => (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );
  const unitOptions = useMemo(
    () => (units ?? []).map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      businessUnitId: form.businessUnitId || null,
      name: form.name,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      owner: form.owner || null,
      nextAction: form.nextAction || null,
      risks: form.risks || null,
      startDate: form.startDate || null,
      targetDate: form.targetDate || null,
    };
    try {
      await save.mutateAsync({
        id: project?.id,
        // organizationId solo se envía al crear (no se cambia al editar).
        data: editing ? base : { ...base, organizationId: form.organizationId },
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
      title={editing ? 'Editar proyecto' : 'Nuevo proyecto'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa" required>
            <Select
              options={orgOptions}
              placeholder="Selecciona empresa"
              value={form.organizationId}
              onChange={(e) => {
                set('organizationId', e.target.value);
                set('businessUnitId', '');
              }}
              disabled={editing}
              required
            />
          </Field>
          <Field label="Unidad de negocio">
            <Select
              options={unitOptions}
              placeholder="Sin unidad"
              value={form.businessUnitId}
              onChange={(e) => set('businessUnitId', e.target.value)}
              disabled={!form.organizationId}
            />
          </Field>
        </div>

        <Field label="Nombre" required>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado">
            <Select
              options={projectStatusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
          <Field label="Prioridad">
            <Select
              options={priorityOptions}
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicio">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </Field>
          <Field label="Fecha objetivo">
            <Input
              type="date"
              value={form.targetDate}
              onChange={(e) => set('targetDate', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Responsable">
          <Input
            value={form.owner}
            onChange={(e) => set('owner', e.target.value)}
          />
        </Field>
        <Field label="Próxima acción">
          <Input
            value={form.nextAction}
            onChange={(e) => set('nextAction', e.target.value)}
          />
        </Field>
        <Field label="Riesgos">
          <Textarea
            value={form.risks}
            onChange={(e) => set('risks', e.target.value)}
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
