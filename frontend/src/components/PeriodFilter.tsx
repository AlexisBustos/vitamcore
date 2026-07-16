// Filtro de período: selector de granularidad (Mes / Semana) + desplegable de
// períodos con datos, etiquetados de forma legible. Reemplaza a MonthFilter.
import { Select } from '@/components/ui/select';
import { periodLabel } from '@/lib/period';
import type { Granularity } from '@/hooks/finance-shared';

export function PeriodFilter({
  granularity,
  period,
  periods,
  onGranularityChange,
  onPeriodChange,
}: {
  granularity: Granularity;
  period?: string;
  periods: string[];
  onGranularityChange: (g: Granularity) => void;
  onPeriodChange: (p: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
        {(['month', 'week'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGranularityChange(g)}
            className={
              granularity === g
                ? 'rounded-md px-3 py-1 text-sm font-medium bg-[var(--color-primary)] text-white transition-colors'
                : 'rounded-md px-3 py-1 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors'
            }
          >
            {g === 'month' ? 'Mes' : 'Semana'}
          </button>
        ))}
      </div>
      <div className="w-52">
        <Select
          placeholder={granularity === 'week' ? 'Todas las semanas' : 'Todos los meses'}
          options={periods.map((p) => ({ value: p, label: periodLabel(p) }))}
          value={period ?? ''}
          onChange={(e) => onPeriodChange(e.target.value || undefined)}
        />
      </div>
    </div>
  );
}
