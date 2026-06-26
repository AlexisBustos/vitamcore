import { Select } from '@/components/ui/select';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// 'YYYY-MM' → 'Enero 2026'
function labelMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const nombre = MESES[m - 1];
  return nombre != null ? `${nombre} ${y}` : ym;
}

export function MonthFilter({
  months,
  value,
  onChange,
}: {
  months: string[];
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      placeholder="Todos los meses"
      options={months.map((m) => ({ value: m, label: labelMes(m) }))}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}
