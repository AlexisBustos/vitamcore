import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { MonthFilter } from '@/components/MonthFilter';
import { cn } from '@/lib/utils';
import { useBankTransactionMonths } from '@/hooks/useFinance';
import { FinanceSummaryTab } from './FinanceSummaryTab';
import { IncomeTab } from './IncomeTab';
import { ExpensesTab } from './ExpensesTab';
import { FinanceImportsTab } from './FinanceImportsTab';
import { ReceivablesTab } from './ReceivablesTab';
import { PayablesTab } from './PayablesTab';
import { BanksTab } from './BanksTab';
import { AutoReconcileModal } from './AutoReconcileModal';

type Tab =
  | 'summary'
  | 'income'
  | 'expenses'
  | 'imports'
  | 'receivables'
  | 'payables'
  | 'banks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'receivables', label: 'Cuentas por cobrar' },
  { id: 'income', label: 'Ingresos' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'payables', label: 'Cuentas por pagar' },
  { id: 'banks', label: 'Bancos' },
  { id: 'imports', label: 'Importaciones' },
];

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('summary');
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  // Mes del Cuadre (no afecta posición). Default = mes más reciente con datos.
  const [consolidatedMonth, setConsolidatedMonth] = useState<string | undefined>();
  const [monthTouched, setMonthTouched] = useState(false);
  const months = useBankTransactionMonths({ organizationId });

  useEffect(() => {
    if (!monthTouched && !consolidatedMonth && (months.data?.length ?? 0) > 0) {
      setConsolidatedMonth(months.data![0]); // lista ordenada DESC
    }
  }, [months.data, monthTouched, consolidatedMonth]);

  // Deep-link a Bancos filtrado a "Suelto".
  const [banksInitialFilter, setBanksInitialFilter] =
    useState<'linked' | 'unlinked' | undefined>();
  function reviewUnlinked() {
    setBanksInitialFilter('unlinked');
    setTab('banks');
  }

  const [autoOpen, setAutoOpen] = useState(false);
  function openAutoReconcile() {
    if (!organizationId) {
      alert('Selecciona una empresa para auto-conciliar.');
      return;
    }
    setAutoOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Control ejecutivo de ingresos, gastos y compromisos."
        actions={
          <div className="flex items-center gap-2">
            {tab === 'summary' && (
              <div className="w-44">
                <MonthFilter
                  months={months.data ?? []}
                  value={consolidatedMonth}
                  onChange={(m) => {
                    setMonthTouched(true);
                    setConsolidatedMonth(m);
                  }}
                />
              </div>
            )}
            <div className="w-56">
              <OrganizationFilter
                value={organizationId}
                onChange={(v) => setOrganizationId(v || undefined)}
              />
            </div>
          </div>
        }
      />

      <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <FinanceSummaryTab
          organizationId={organizationId}
          consolidatedMonth={consolidatedMonth}
          onReviewUnlinked={reviewUnlinked}
          onAutoReconcile={openAutoReconcile}
        />
      )}
      {tab === 'receivables' && <ReceivablesTab organizationId={organizationId} />}
      {tab === 'income' && <IncomeTab organizationId={organizationId} />}
      {tab === 'expenses' && <ExpensesTab organizationId={organizationId} />}
      {tab === 'payables' && <PayablesTab organizationId={organizationId} />}
      {tab === 'banks' && (
        <BanksTab
          organizationId={organizationId}
          initialReconciliation={banksInitialFilter}
        />
      )}
      {tab === 'imports' && <FinanceImportsTab organizationId={organizationId} />}

      {autoOpen && organizationId && (
        <AutoReconcileModal
          open={autoOpen}
          onClose={() => setAutoOpen(false)}
          organizationId={organizationId}
          month={consolidatedMonth}
        />
      )}
    </div>
  );
}
