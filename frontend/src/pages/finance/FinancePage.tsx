import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { PeriodFilter } from '@/components/PeriodFilter';
import { cn } from '@/lib/utils';
import { useBankTransactionPeriods, type Granularity } from '@/hooks/useFinance';
import { FinanceSummaryTab } from './FinanceSummaryTab';
import { TrendTab } from './TrendTab';
import { IncomeTab } from './IncomeTab';
import { ExpensesTab } from './ExpensesTab';
import { FinanceImportsTab } from './FinanceImportsTab';
import { ReceivablesTab } from './ReceivablesTab';
import { PayablesTab } from './PayablesTab';
import { BanksTab } from './BanksTab';
import { AutoReconcileModal } from './AutoReconcileModal';
import { RecognizeTransfersModal } from './RecognizeTransfersModal';

type Tab =
  | 'summary'
  | 'trend'
  | 'income'
  | 'expenses'
  | 'imports'
  | 'receivables'
  | 'payables'
  | 'banks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'trend', label: 'Tendencia' },
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

  // Período del Cuadre (no afecta posición). Granularidad = lente (mes/semana);
  // por defecto el período más reciente con datos. La semana es lente, el mes
  // es la verdad contable.
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [consolidatedPeriod, setConsolidatedPeriod] = useState<string | undefined>();
  const [periodTouched, setPeriodTouched] = useState(false);
  const periods = useBankTransactionPeriods({ organizationId, granularity });

  useEffect(() => {
    if (!periodTouched && !consolidatedPeriod && (periods.data?.length ?? 0) > 0) {
      setConsolidatedPeriod(periods.data![0]); // lista ordenada DESC
    }
  }, [periods.data, periodTouched, consolidatedPeriod]);

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

  const [recognizeDir, setRecognizeDir] = useState<'expense' | 'income' | null>(
    null,
  );
  function openRecognizeTransfers(direction: 'expense' | 'income') {
    if (!organizationId) {
      alert('Selecciona una empresa para reconocer transferencias.');
      return;
    }
    setRecognizeDir(direction);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Control ejecutivo de ingresos, gastos y compromisos."
        actions={
          <div className="flex items-center gap-2">
            {tab === 'summary' && (
              <PeriodFilter
                granularity={granularity}
                period={consolidatedPeriod}
                periods={periods.data ?? []}
                onGranularityChange={(g) => {
                  // Cambiar de lente: descarta el período y deja que el efecto
                  // vuelva a elegir el más reciente del nuevo grano.
                  setGranularity(g);
                  setConsolidatedPeriod(undefined);
                  setPeriodTouched(false);
                }}
                onPeriodChange={(p) => {
                  setPeriodTouched(true);
                  setConsolidatedPeriod(p);
                }}
              />
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
            onClick={() => {
              // Clic manual en una pestaña limpia el filtro forzado del deep-link
              // (si el usuario entra a Bancos por su cuenta, no se le impone "Suelto").
              setBanksInitialFilter(undefined);
              setTab(t.id);
            }}
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
          granularity={granularity}
          consolidatedPeriod={consolidatedPeriod}
          onReviewUnlinked={reviewUnlinked}
          onAutoReconcile={openAutoReconcile}
          onRecognizeTransfers={openRecognizeTransfers}
        />
      )}
      {tab === 'trend' && <TrendTab organizationId={organizationId} />}
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
          granularity={granularity}
          period={consolidatedPeriod}
        />
      )}

      {recognizeDir && organizationId && (
        <RecognizeTransfersModal
          open={!!recognizeDir}
          onClose={() => setRecognizeDir(null)}
          organizationId={organizationId}
          granularity={granularity}
          period={consolidatedPeriod}
          direction={recognizeDir}
        />
      )}
    </div>
  );
}
