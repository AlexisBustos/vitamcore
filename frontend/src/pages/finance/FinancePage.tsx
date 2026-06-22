import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { cn } from '@/lib/utils';
import { FinanceSummaryTab } from './FinanceSummaryTab';
import { IncomeTab } from './IncomeTab';
import { ExpensesTab } from './ExpensesTab';

type Tab = 'summary' | 'income' | 'expenses';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'income', label: 'Ingresos' },
  { id: 'expenses', label: 'Gastos' },
];

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('summary');
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Control ejecutivo de ingresos, gastos y compromisos."
        actions={
          <div className="w-56">
            <OrganizationFilter
              value={organizationId}
              onChange={(v) => setOrganizationId(v || undefined)}
            />
          </div>
        }
      />

      {/* Tabs */}
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

      {tab === 'summary' && <FinanceSummaryTab organizationId={organizationId} />}
      {tab === 'income' && <IncomeTab organizationId={organizationId} />}
      {tab === 'expenses' && <ExpensesTab organizationId={organizationId} />}
    </div>
  );
}
