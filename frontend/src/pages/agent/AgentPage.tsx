import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import { useAgentStatus } from '@/hooks/useAgent';
import { ChatPanel } from './ChatPanel';
import { InsightsPanel } from './InsightsPanel';
import { ProposedTasksPanel } from './ProposedTasksPanel';
import { ReportsPanel } from './ReportsPanel';

type Tab = 'chat' | 'insights' | 'tasks' | 'reports';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Asistente' },
  { id: 'insights', label: 'Insights' },
  { id: 'tasks', label: 'Tareas propuestas' },
  { id: 'reports', label: 'Reportes' },
];

export function AgentPage() {
  const [tab, setTab] = useState<Tab>('chat');
  const { data: status } = useAgentStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA Ejecutiva"
        description="Agente interno que analiza datos reales de VITAM CORE, genera insights, propone tareas y prepara reportes."
        actions={
          status && (
            <Badge
              className={
                status.enabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }
            >
              {status.enabled ? `Agente activo · ${status.provider}` : 'Agente desactivado'}
            </Badge>
          )
        }
      />

      {status && !status.enabled && (
        <ErrorState message="El agente está desactivado (AGENT_ENABLED=false en el backend)." />
      )}

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

      {tab === 'chat' && <ChatPanel status={status} />}
      {tab === 'insights' && <InsightsPanel />}
      {tab === 'tasks' && <ProposedTasksPanel />}
      {tab === 'reports' && <ReportsPanel />}
    </div>
  );
}
