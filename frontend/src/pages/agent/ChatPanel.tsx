import { useMemo, useState, type FormEvent } from 'react';
import { Bot, Lightbulb, ListPlus, Send, Sparkles, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/feedback';
import { AgentContent } from '@/components/AgentContent';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { agentTypeOptions } from '@/lib/agent-domain';
import { getErrorMessage } from '@/lib/errors';
import { useProjects } from '@/hooks/useProjects';
import {
  useChat,
  useQuickAction,
  useSaveInsight,
  type useAgentStatus,
} from '@/hooks/useAgent';
import { cn } from '@/lib/utils';
import { ProposeTaskModal } from './ProposeTaskModal';

interface LocalMessage {
  role: 'USER' | 'AGENT';
  content: string;
  toolsUsed?: string[];
}

// Acciones rápidas: 'action' llama a un endpoint quick-action; 'chat' envía un mensaje.
const QUICK: { label: string; action?: string; chat?: string; agentType?: string }[] = [
  { label: 'Resumen consolidado', action: 'executive-summary' },
  { label: 'Resumen Healthcare', action: 'healthcare-summary' },
  { label: 'Resumen Tech', action: 'tech-summary' },
  { label: 'Análisis financiero', action: 'financial-analysis' },
  { label: 'Seguimiento comercial', action: 'sales-follow-up' },
  { label: 'Riesgos de proyectos', action: 'project-risks' },
  { label: 'Tareas críticas', action: 'project-risks' },
  { label: 'Plan semanal', action: 'weekly-plan' },
  {
    label: 'Decisiones pendientes',
    chat: '¿Qué decisiones estratégicas siguen abiertas o pendientes de revisión?',
    agentType: 'STRATEGY',
  },
  {
    label: 'Documentos recientes',
    chat: 'Lista los documentos recientes y los que no tienen resumen IA.',
    agentType: 'DOCUMENT',
  },
];

export function ChatPanel({
  status,
}: {
  status: ReturnType<typeof useAgentStatus>['data'];
}) {
  const [agentType, setAgentType] = useState('EXECUTIVE');
  const [orgId, setOrgId] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);

  const chat = useChat();
  const quick = useQuickAction();
  const saveInsight = useSaveInsight();

  const { data: projects } = useProjects(
    orgId ? { organizationId: orgId } : {},
  );
  const projectOptions = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const busy = chat.isPending || quick.isPending;
  const lastAgent = [...messages].reverse().find((m) => m.role === 'AGENT');

  async function send(message: string, type = agentType, reset = false) {
    setError(null);
    const history = reset ? [] : messages;
    setMessages([...history, { role: 'USER', content: message }]);
    if (reset) setConversationId(undefined);
    try {
      const res = await chat.mutateAsync({
        message,
        agentType: type,
        organizationId: orgId ?? null,
        projectId: projectId ?? null,
        conversationId: reset ? undefined : conversationId,
      });
      setConversationId(res.conversationId);
      setMessages((m) => [
        ...m,
        { role: 'AGENT', content: res.message.content, toolsUsed: res.toolsUsed },
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function runQuick(q: (typeof QUICK)[number]) {
    setError(null);
    if (q.chat) {
      await send(q.chat, q.agentType ?? agentType, true);
      return;
    }
    setMessages([{ role: 'USER', content: q.label }]);
    setConversationId(undefined);
    try {
      const res = await quick.mutateAsync({
        action: q.action!,
        organizationId: orgId,
      });
      setConversationId(res.conversationId);
      setMessages((m) => [
        ...m,
        { role: 'AGENT', content: res.message.content, toolsUsed: res.toolsUsed },
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    send(msg);
  }

  async function handleSaveInsight() {
    if (!lastAgent) return;
    const firstLine =
      lastAgent.content
        .split('\n')
        .map((l) => l.replace(/^[#\-\s]+/, '').trim())
        .find((l) => l.length > 0) ?? 'Hallazgo del agente';
    await saveInsight.mutateAsync({
      title: firstLine.slice(0, 120),
      summary: lastAgent.content.slice(0, 3000),
      type: 'EXECUTIVE_SUMMARY',
      priority: 'MEDIUM',
      evidence: `Herramientas: ${(lastAgent.toolsUsed ?? []).join(', ') || '—'}`,
      agentType,
      organizationId: orgId ?? null,
      projectId: projectId ?? null,
    });
  }

  return (
    <div className="space-y-4">
      {/* Selectores de contexto */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            options={agentTypeOptions}
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
          />
          <OrganizationFilter
            value={orgId}
            onChange={(v) => {
              setOrgId(v || undefined);
              setProjectId(undefined);
            }}
          />
          <Select
            options={projectOptions}
            placeholder="Todos los proyectos"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || undefined)}
            disabled={!orgId}
          />
        </div>
        {status && (
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            Proveedor: <strong>{status.provider}</strong>
            {status.provider === 'anthropic' ? ` (${status.model})` : ' (motor heurístico sobre datos reales)'}
            {' · '}escritura por IA: {status.allowWriteActions ? 'activa' : 'desactivada'}
          </p>
        )}
      </Card>

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <Button
            key={q.label}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => runQuick(q)}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            {q.label}
          </Button>
        ))}
      </div>

      {/* Historial */}
      <Card className="min-h-[280px]">
        <CardContent className="space-y-4 p-5">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
              Haz una pregunta o usa una acción rápida. El agente responde con
              datos reales de VITAM CORE.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className="flex gap-3">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  m.role === 'USER'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-muted)] text-[var(--color-accent)]',
                )}
              >
                {m.role === 'USER' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {m.role === 'USER' ? (
                  <p className="text-sm font-medium text-[var(--color-foreground)]">
                    {m.content}
                  </p>
                ) : (
                  <>
                    <AgentContent content={m.content} />
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.toolsUsed.map((t) => (
                          <Badge
                            key={t}
                            className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && <Spinner label="El agente está analizando…" />}
        </CardContent>
      </Card>

      {/* Acciones sobre la última respuesta */}
      {lastAgent && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveInsight}
            disabled={saveInsight.isPending}
          >
            <Lightbulb className="h-4 w-4 text-[var(--color-warning)]" />
            {saveInsight.isPending ? 'Guardando…' : 'Guardar insight'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setProposeOpen(true)}>
            <ListPlus className="h-4 w-4 text-[var(--color-accent)]" />
            Proponer tarea
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {/* Entrada */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta al agente ejecutivo…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {proposeOpen && (
        <ProposeTaskModal
          open={proposeOpen}
          onClose={() => setProposeOpen(false)}
          defaultOrganizationId={orgId}
          defaultRationale={
            lastAgent ? 'Sugerida a partir del análisis del agente ejecutivo.' : undefined
          }
        />
      )}
    </div>
  );
}
