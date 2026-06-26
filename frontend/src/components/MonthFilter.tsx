import { Select } from '@/components/ui/select';
import { useIncomeMonths } from '@/hooks/useFinance';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// 'YYYY-MM' → 'Enero 2026'
function labelMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1] ?? ym} ${y}`;
}

export function MonthFilter({
  organizationId,
  value,
  onChange,
}: {
  organizationId?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const { data: months = [] } = useIncomeMonths(organizationId);
  return (
    <Select
      placeholder="Todos los meses"
      options={months.map((m) => ({ value: m, label: labelMes(m) }))}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}
