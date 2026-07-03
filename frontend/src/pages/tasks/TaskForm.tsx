import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  priorityOptions,
  taskSourceOptions,
  taskStatusOptions,
} from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useBusinessUnits } from '@/hooks/useBusinessUnits';
import { useProjects } from '@/hooks/useProjects';
import { useAssignees } from '@/hooks/useAssignees';
import { useSaveTask } from '@/hooks/useTasks';
import type { Task } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaultOrganizationId?: string;
  defaultProjectId?: string;
  defaultStatus?: Task['status'];
  // Bloquea el cambio de empresa/proyecto (al crear desde un proyecto).
  lockContext?: boolean;
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function TaskForm({
  open,
  onClose,
  task,
  defaultOrganizationId,
  defaultProjectId,
  defaultStatus,
  lockContext,
}: Props) {
  const editing = !!task;
  const save = useSaveTask();
  const { data: organizations } = useOrganizations();
  const { data: assignees } = useAssignees();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    organizationId: task?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: task?.businessUnitId ?? '',
    projectId: task?.projectId ?? defaultProjectId ?? '',
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaultStatus ?? 'TODO',
    priority: task?.priority ?? 'MEDIUM',
    source: task?.source ?? 'MANUAL',
    ownerId: task?.ownerId ?? '',
    dueDate: toDateInput(task?.dueDate),
  });

  const orgFilter = form.organizationId
    ? { organizationId: form.organizationId }
    : {};
  const { data: units } = useBusinessUnits(orgFilter);
  const { data: projects } = useProjects(orgFilter);

  const orgOptions = useMemo(
    () => (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );
  const unitOptions = useMemo(
    () => (units ?? []).map((u) => ({ value: u.id, label: u.name })),
    [units],
  );
  const projectOptions = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );
  const assigneeOptions = useMemo(
    () => (assignees ?? []).map((u) => ({ value: u.id, label: u.name })),
    [assignees],
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      businessUnitId: form.businessUnitId || null,
      projectId: form.projectId || null,
      title: form.title,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      source: form.source,
      ownerId: form.ownerId || null,
      dueDate: form.dueDate || null,
    };
    try {
      await save.mutateAsync({
        id: task?.id,
        data: editing
          ? base
          : { ...base, organizationId: form.organizationId },
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
      title={editing ? 'Editar tarea' : 'Nueva tarea'}
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
                set('projectId', '');
              }}
              disabled={editing || lockContext}
              required
            />
          </Field>
          <Field label="Proyecto">
            <Select
              options={projectOptions}
              placeholder="Sin proyecto"
              value={form.projectId}
              onChange={(e) => set('projectId', e.target.value)}
              disabled={!form.organizationId || lockContext}
            />
          </Field>
        </div>

        <Field label="Título" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unidad de negocio">
            <Select
              options={unitOptions}
              placeholder="Sin unidad"
              value={form.businessUnitId}
              onChange={(e) => set('businessUnitId', e.target.value)}
              disabled={!form.organizationId}
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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado">
            <Select
              options={taskStatusOptions}
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
          <Field label="Origen">
            <Select
              options={taskSourceOptions}
              value={form.source}
              onChange={(e) => set('source', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Responsable">
          <Select
            options={assigneeOptions}
            placeholder="Sin asignar"
            value={form.ownerId}
            onChange={(e) => set('ownerId', e.target.value)}
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
