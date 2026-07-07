// Tab genérico de libro (cuentas por cobrar / cuentas por pagar).
// Unifica ReceivablesTab y PayablesTab: la estructura (filtros de estado + mes,
// Card con total, tabla, ReconcileModal) es idéntica; lo que cambia entre
// ingresos y gastos se recibe vía `config` (hooks, textos, accessors de fila).
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import type { FinanceFilters, useRegisterPayment } from '@/hooks/useFinance';
import { MonthFilter } from '@/components/MonthFilter';
import type { IncomeRecord, ExpenseRecord } from '@/types/domain';
import { ReconcileModal } from '@/pages/finance/ReconcileModal';

// Estado de filtro: el union real de FinanceFilters.paymentState (NO string suelto).
type PaymentStateFilter = NonNullable<FinanceFilters['paymentState']>;

export interface LedgerTabConfig<T extends IncomeRecord | ExpenseRecord> {
  recordType: 'income' | 'expense';
  icon: LucideIcon;
  estados: { value: PaymentStateFilter; label: string }[];
  initialEstado: PaymentStateFilter;
  listHook: (filters: FinanceFilters) => UseQueryResult<T[]>;
  monthsHook: (organizationId?: string) => UseQueryResult<string[]>;
  registerHook: () => ReturnType<typeof useRegisterPayment>;
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
  const [month, setMonth] = useState<string | undefined>();
  const [reconciling, setReconciling] = useState<T | null>(null);

  const { data: rows = [], isLoading, isError, error } = config.listHook({
    organizationId,
    paymentState: estado,
    month,
  });
  const registrar = config.registerHook();
  const { data: months = [] } = config.monthsHook(organizationId);

  const Icon = config.icon;
  const total = rows.reduce((s, r) => s + config.rowTotal(r), 0);

  if (!organizationId) {
    return (
      <EmptyState title="Selecciona una empresa">
        {config.emptyNoOrg}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros de estado + mes */}
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
        <div className="w-48">
          <MonthFilter months={months} value={month} onChange={setMonth} />
        </div>
      </div>

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
                  return (
                    <tr key={r.id}>
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
                        {r.paidDate ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              registrar.mutate({ id: r.id, paidDate: null })
                            }
                            disabled={registrar.isPending}
                          >
                            Revertir
                          </Button>
                        ) : (
                          <Button onClick={() => setReconciling(r)} disabled={registrar.isPending}>
                            Conciliar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {registrar.isError && (
        <ErrorState message={getErrorMessage(registrar.error)} />
      )}

      <ReconcileModal
        open={!!reconciling}
        onClose={() => setReconciling(null)}
        recordType={config.recordType}
        record={
          reconciling
            ? {
                id: reconciling.id,
                name: config.partyName(reconciling),
                folio: reconciling.sourceFolio ?? null,
                amount: config.rowTotal(reconciling),
              }
            : null
        }
        pending={registrar.isPending}
        onReconcile={(bankTransactionId) => {
          if (reconciling) registrar.mutate({ id: reconciling.id, bankTransactionId });
          setReconciling(null);
        }}
        onPayManual={(paidDate) => {
          if (reconciling) registrar.mutate({ id: reconciling.id, paidDate });
          setReconciling(null);
        }}
      />
    </div>
  );
}
