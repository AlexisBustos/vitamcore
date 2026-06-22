import { useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { useOrganizations } from '@/hooks/useOrganizations';

interface Props {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Select de empresas reutilizable para barras de filtros. */
export function OrganizationFilter({ value, onChange, placeholder }: Props) {
  const { data } = useOrganizations();
  const options = useMemo(
    () => (data ?? []).map((o) => ({ value: o.id, label: o.name })),
    [data],
  );
  return (
    <Select
      options={options}
      placeholder={placeholder ?? 'Todas las empresas'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
