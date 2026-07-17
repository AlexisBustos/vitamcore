import { useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { lastPeriods, periodLabel, periodShortLabel } from '@/lib/period';
import { useImportCoverage } from '@/hooks/useFinance';
import type { CoverageStatus } from '@/types/domain';

const WEEKS = 12;

const CELL: Record<CoverageStatus, { className: string; texto: string }> = {
  covered: { className: 'bg-[var(--color-success)]', texto: 'Cargado' },
  partial: { className: 'bg-amber-500', texto: 'Parcial' },
  missing: { className: 'bg-[var(--color-muted)] border border-[var(--color-border)]', texto: 'Falta' },
};

// "Qué falta por cargar": filas = fuentes, columnas = últimas 12 semanas.
export function CoverageGrid({ organizationId }: { organizationId: string }) {
  const periods = useMemo(() => lastPeriods('week', WEEKS), []);
  const from = periods[0];
  const to = periods[periods.length - 1];

  const { data, isLoading, isError, error } = useImportCoverage({
    organizationId,
    granularity: 'week',
    from,
    to,
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--color-foreground)]">
            Cobertura de carga · últimas {WEEKS} semanas
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <Leyenda status="covered" />
          <Leyenda status="partial" />
          <Leyenda status="missing" />
        </div>
      </div>

      {isLoading && <Spinner label="Cargando cobertura…" />}
      {isError && (
        <div className="p-5">
          <ErrorState message={getErrorMessage(error)} />
        </div>
      )}

      {data && (
        <div className="overflow-x-auto p-5">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="pr-3 text-left text-xs font-medium text-[var(--color-muted-foreground)]">
                  Fuente
                </th>
                {data.periods.map((p) => (
                  <th
                    key={p}
                    title={periodLabel(p)}
                    className="w-8 text-center text-[10px] font-normal text-[var(--color-muted-foreground)]"
                  >
                    {periodShortLabel(p)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.source.type}-${row.source.bankAccountId ?? ''}`}>
                  <td className="whitespace-nowrap pr-3 text-sm text-[var(--color-foreground)]">
                    {row.source.label}
                  </td>
                  {row.cells.map((cell) => {
                    const c = CELL[cell.status];
                    return (
                      <td key={cell.period} className="text-center">
                        <span
                          title={`${row.source.label} · ${periodLabel(cell.period)}: ${c.texto}`}
                          className={`inline-block h-6 w-6 rounded ${c.className}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            Verde = semana cargada (aunque no haya movimientos); ámbar = cargada a medias; gris =
            falta por cargar. La cobertura bancaria es por cuenta.
          </p>
        </div>
      )}
    </Card>
  );
}

function Leyenda({ status }: { status: CoverageStatus }) {
  const c = CELL[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${c.className}`} />
      {c.texto}
    </span>
  );
}
