// Tab genérico de libro (cuentas por cobrar / cuentas por pagar).
// Unifica ReceivablesTab y PayablesTab: la estructura (filtros de estado +
// período + búsqueda, Card con total, tabla con selección múltiple,
// ReconcileModal) es
// idéntica; lo que cambia entre ingresos y gastos se recibe vía `config` (hooks,
// textos, accessors de fila).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import type {
  FinanceFilters,
  Granularity,
  useRegisterPayment,
  useBulkRegisterPayment,
} from '@/hooks/useFinance';
import { PeriodFilter } from '@/components/PeriodFilter';
import type { IncomeRecord, ExpenseRecord } from '@/types/domain';
import { ReconcileModal, type ReconcileTarget } from '@/pages/finance/ReconcileModal';

// Estado de filtro: el union real de FinanceFilters.paymentState (NO string suelto).
type PaymentStateFilter = NonNullable<FinanceFilters['paymentState']>;

export interface LedgerTabConfig<T extends IncomeRecord | ExpenseRecord> {
  recordType: 'income' | 'expense';
  icon: LucideIcon;
  estados: { value: PaymentStateFilter; label: string }[];
  initialEstado: PaymentStateFilter;
  listHook: (filters: FinanceFilters) => UseQueryResult<T[]>;
  periodsHook: (
    granularity: Granularity,
    organizationId?: string,
  ) => UseQueryResult<string[]>;
  registerHook: () => ReturnType<typeof useRegisterPayment>;
  bulkRegisterHook: () => ReturnType<typeof useBulkRegisterPayment>;
  rowTotal: (r: T) => number;
  issueDate: (r: T) => string | null;
  partyName: (r: T) => string;
  renderPartyCell: (r: T) => ReactNode;
  amountHeader: string;
  emptyNoOrg: string;
  spinnerLabel: string;
  emptyTable: string;
}

interface LedgerTabProps<T extends IncomeRecord | ExpenseRecord> {
  organizationId?: string;
  config: LedgerTabConfig<T>;
}

export function LedgerTab<T extends IncomeRecord | ExpenseRecord>({
  organizationId,
  config,
}: LedgerTabProps<T>) {
  const [estado, setEstado] = useState<PaymentStateFilter>(config.initialEstado);
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [period, setPeriod] = useState<string | undefined>();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reconcileTarget, setReconcileTarget] = useState<ReconcileTarget | null>(null);

  // Debounce de la búsqueda (~300 ms) para no disparar una query por tecla.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: rows = [], isLoading, isError, error } = config.listHook({
    organizationId,
    paymentState: estado,
    granularity,
    period,
    search: search || undefined,
  });
  const registrar = config.registerHook();
  const bulk = config.bulkRegisterHook();
  const { data: periods = [] } = config.periodsHook(granularity, organizationId);

  // Al cambiar de granularidad se descarta el período elegido (una clave de mes
  // no es válida como semana y viceversa); vuelve a "todos".
  useEffect(() => {
    setPeriod(undefined);
  }, [granularity]);

  // Al cambiar de estado, período o búsqueda se limpia la selección (evita
  // operar sobre filas que ya no se ven).
  useEffect(() => {
    setSelected(new Set());
  }, [estado, granularity, period, search]);

  const Icon = config.icon;
  const total = rows.reduce((s, r) => s + config.rowTotal(r), 0);

  // La selección solo aplica a estados accionables; en "Anuladas" no hay acción.
  const selectable = estado !== 'cancelled';
  const isPaidState = estado === 'paid';

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const selectedTotal = selectedRows.reduce((s, r) => s + config.rowTotal(r), 0);
  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(() =>
      allVisibleSelected ? new Set() : new Set(rows.map((r) => r.id)),
    );
  const clearSelection = () => setSelected(new Set());

  const busy = registrar.isPending || bulk.isPending;

  const openBulkReconcile = () => {
    if (!organizationId || selectedRows.length === 0) return;
    setReconcileTarget({
      ids: selectedRows.map((r) => r.id),
      organizationId,
      amount: selectedTotal,
      label: `${selectedRows.length} ${
        config.recordType === 'income' ? 'facturas' : 'gastos'
      }`,
    });
  };
  const bulkRevert = () => {
    if (selectedRows.length === 0) return;
    bulk.mutate(
      { ids: selectedRows.map((r) => r.id), paidDate: null, bankTransactionId: null },
      { onSuccess: clearSelection },
    );
  };

  if (!organizationId) {
    return (
      <EmptyState title="Selecciona una empresa">
        {config.emptyNoOrg}
      </EmptyState>
    );
  }

  const colSpan = selectable ? 7 : 6;

  return (
    <div className="space-y-5">
      {/* Filtros de estado + mes + búsqueda */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
          {config.estados.map((e) => (
            <button
              key={e.value}
              onClick={() => setEstado(e.value)}
              className={
                estado === e.value
                  ? 'rounded-md px-4 py-1.5 text-sm font-medium bg-[var(--color-primary)] text-white transition-colors'
                  : 'rounded-md px-4 py-1.5 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors'
              }
            >
              {e.label}
            </button>
          ))}
        </div>
        <PeriodFilter
          granularity={granularity}
          period={period}
          periods={periods}
          onGranularityChange={setGranularity}
          onPeriodChange={setPeriod}
        />
        <div className="min-w-56 flex-1">
          <Input
            placeholder={
              config.recordType === 'income'
                ? 'Buscar por cliente, folio o RUT…'
                : 'Buscar por proveedor, folio o RUT…'
            }
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {/* Barra de acciones sobre la selección */}
      {selectable && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--color-primary)] bg-[var(--color-primary)]/5 px-4 py-3">
          <span className="text-sm font-medium text-[var(--color-foreground)]">
            {selectedRows.length} seleccionada{selectedRows.length > 1 ? 's' : ''} ·{' '}
            <span className="text-[var(--color-primary)]">
              {formatMoney(selectedTotal)}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {isPaidState ? (
              <Button variant="outline" onClick={bulkRevert} disabled={busy}>
                Revertir {selectedRows.length} seleccionada{selectedRows.length > 1 ? 's' : ''}
              </Button>
            ) : (
              <Button onClick={openBulkReconcile} disabled={busy}>
                Conciliar {selectedRows.length}{' '}
                {config.recordType === 'income' ? 'factura' : 'gasto'}
                {selectedRows.length > 1 ? 's' : ''} con un movimiento
              </Button>
            )}
            <button
              onClick={clearSelection}
              className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {/* Encabezado con total */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">
              {config.estados.find((e) => e.value === estado)?.label ?? estado}
            </h2>
          </div>
          {!isLoading && !isError && rows.length > 0 && (
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              Total:{' '}
              <span className="text-[var(--color-primary)]">
                {formatMoney(total)}
              </span>
            </span>
          )}
        </div>

        {isLoading && <Spinner label={config.spinnerLabel} />}
        {isError && (
          <div className="p-5">
            <ErrorState message={getErrorMessage(error)} />
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState title={config.emptyTable} />
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  {selectable && (
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todo"
                        className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">
                    {config.recordType === 'income' ? 'Cliente' : 'Proveedor'}
                  </th>
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                  <th className="px-4 py-3 text-right font-medium">{config.amountHeader}</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => {
                  const issueDate = config.issueDate(r);
                  const checked = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={checked ? 'bg-[var(--color-primary)]/5' : undefined}
                    >
                      {selectable && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label="Seleccionar fila"
                            className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                            checked={checked}
                            onChange={() => toggleOne(r.id)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {config.renderPartyCell(r)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {r.sourceFolio ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {issueDate ? formatDate(issueDate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {r.dueDate ? formatDate(r.dueDate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(config.rowTotal(r))}
                      </td>
                      <td className="px-4 py-3">
                        {/* Con una selección activa, la única acción es la barra
                            masiva de arriba: se ocultan los botones por fila para
                            no conciliar una sola factura por error. */}
                        {selected.size > 0 ? (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {checked ? '↑ en selección' : '—'}
                          </span>
                        ) : r.paidDate ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              registrar.mutate({ id: r.id, paidDate: null })
                            }
                            disabled={busy}
                          >
                            Revertir
                          </Button>
                        ) : (
                          <Button
                            onClick={() =>
                              setReconcileTarget({
                                ids: [r.id],
                                recordId: r.id,
                                organizationId,
                                amount: config.rowTotal(r),
                                label: `${config.partyName(r)} · ${r.sourceFolio ?? 's/folio'}`,
                              })
                            }
                            disabled={busy}
                          >
                            Conciliar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {selectable && selectedRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-[var(--color-border)] bg-[var(--color-muted)]">
                    <td colSpan={colSpan} className="px-4 py-2 text-xs text-[var(--color-muted-foreground)]">
                      {selectedRows.length} seleccionada{selectedRows.length > 1 ? 's' : ''} ·
                      Σ {formatMoney(selectedTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {(registrar.isError || bulk.isError) && (
        <ErrorState
          message={getErrorMessage(registrar.error ?? bulk.error)}
        />
      )}

      <ReconcileModal
        open={!!reconcileTarget}
        onClose={() => setReconcileTarget(null)}
        recordType={config.recordType}
        target={reconcileTarget}
        pending={bulk.isPending}
        onReconcile={(bankTransactionId) => {
          if (reconcileTarget) {
            bulk.mutate(
              { ids: reconcileTarget.ids, bankTransactionId },
              { onSuccess: clearSelection },
            );
          }
          setReconcileTarget(null);
        }}
        onPayManual={(paidDate) => {
          if (reconcileTarget) {
            bulk.mutate(
              { ids: reconcileTarget.ids, paidDate },
              { onSuccess: clearSelection },
            );
          }
          setReconcileTarget(null);
        }}
      />
    </div>
  );
}
