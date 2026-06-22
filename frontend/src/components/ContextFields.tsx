import { useMemo } from 'react';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useBusinessUnits } from '@/hooks/useBusinessUnits';
import { useProjects } from '@/hooks/useProjects';

export interface ContextValue {
  organizationId: string;
  businessUnitId: string;
  projectId: string;
}

interface Props {
  value: ContextValue;
  onChange: (patch: Partial<ContextValue>) => void;
  /** Bloquea el cambio de empresa (p. ej. al editar). */
  lockOrganization?: boolean;
}

/**
 * Selectores de contexto empresa → unidad → proyecto.
 * La unidad y el proyecto se cargan según la empresa elegida y se
 * limpian al cambiarla.
 */
export function ContextFields({ value, onChange, lockOrganization }: Props) {
  const { data: organizations } = useOrganizations();
  const orgFilter = value.organizationId
    ? { organizationId: value.organizationId }
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

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Empresa" required>
        <Select
          options={orgOptions}
          placeholder="Selecciona empresa"
          value={value.organizationId}
          onChange={(e) =>
            onChange({
              organizationId: e.target.value,
              businessUnitId: '',
              projectId: '',
            })
          }
          disabled={lockOrganization}
          required
        />
      </Field>
      <Field label="Unidad de negocio">
        <Select
          options={unitOptions}
          placeholder="Sin unidad"
          value={value.businessUnitId}
          onChange={(e) => onChange({ businessUnitId: e.target.value })}
          disabled={!value.organizationId}
        />
      </Field>
      <Field label="Proyecto">
        <Select
          options={projectOptions}
          placeholder="Sin proyecto"
          value={value.projectId}
          onChange={(e) => onChange({ projectId: e.target.value })}
          disabled={!value.organizationId}
        />
      </Field>
    </div>
  );
}
