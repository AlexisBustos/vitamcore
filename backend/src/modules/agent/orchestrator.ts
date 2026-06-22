/**
 * Agent Orchestrator.
 *
 * Coordina: recepción del mensaje → construcción de contexto → ejecución del
 * proveedor (Claude o heurístico) → persistencia de conversación, mensajes y
 * trazabilidad de herramientas → respuesta estructurada.
 */
import type { AgentType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../utils/http-error';
import { getProvider, isAgentEnabled, providerName } from './providers';
import type { QuickIntent } from './providers/types';

interface ChatParams {
  conversationId?: string;
  agentType: AgentType;
  organizationId?: string | null;
  projectId?: string | null;
  message: string;
  intent?: QuickIntent;
  title?: string;
}

function ensureEnabled() {
  if (!isAgentEnabled()) {
    throw badRequest(
      'El agente está desactivado (AGENT_ENABLED=false en el backend).',
    );
  }
}

export async function chat(params: ChatParams) {
  ensureEnabled();

  // Conversación: reutiliza o crea.
  let conversation = params.conversationId
    ? await prisma.agentConversation.findUnique({
        where: { id: params.conversationId },
      })
    : null;

  if (params.conversationId && !conversation) {
    throw notFound('Conversación no encontrada');
  }

  if (!conversation) {
    conversation = await prisma.agentConversation.create({
      data: {
        title: params.title ?? buildTitle(params.message),
        agentType: params.agentType,
        organizationId: params.organizationId ?? null,
        projectId: params.projectId ?? null,
      },
    });
  }

  // Historial reciente como contexto (limitado).
  const previous = await prisma.agentMessage.findMany({
    where: { conversationId: conversation.id, role: { in: ['USER', 'AGENT'] } },
    orderBy: { createdAt: 'asc' },
    take: env.AGENT_MAX_CONTEXT_ITEMS,
  });

  // Persiste el mensaje del usuario.
  await prisma.agentMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'USER',
      content: params.message,
    },
  });

  // Ejecuta el proveedor.
  const provider = getProvider();
  const result = await provider.run({
    agentType: params.agentType,
    message: params.message,
    organizationId: params.organizationId,
    projectId: params.projectId,
    allowWrite: env.AGENT_ALLOW_WRITE_ACTIONS,
    intent: params.intent,
    history: previous.map((m) => ({
      role: m.role as 'USER' | 'AGENT',
      content: m.content,
    })),
  });

  // Persiste la respuesta del agente con trazabilidad (tools usadas).
  const agentMessage = await prisma.agentMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'AGENT',
      content: result.content,
      metadata: {
        provider: result.provider,
        toolsUsed: result.toolsUsed,
        agentType: params.agentType,
      },
    },
  });

  await prisma.agentConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  return {
    conversationId: conversation.id,
    message: agentMessage,
    toolsUsed: result.toolsUsed,
    provider: result.provider,
  };
}

const QUICK_ACTIONS: Record<
  string,
  { intent: QuickIntent; agentType: AgentType; prompt: string; title: string }
> = {
  'executive-summary': {
    intent: 'executive-summary' as QuickIntent,
    agentType: 'EXECUTIVE',
    prompt: 'Genera un resumen ejecutivo consolidado de ambas empresas.',
    title: 'Resumen ejecutivo consolidado',
  },
  'healthcare-summary': {
    intent: 'healthcare-summary',
    agentType: 'EXECUTIVE',
    prompt: 'Genera un resumen ejecutivo de Vitam Healthcare.',
    title: 'Resumen Vitam Healthcare',
  },
  'tech-summary': {
    intent: 'tech-summary',
    agentType: 'EXECUTIVE',
    prompt: 'Genera un resumen ejecutivo de Vitam Tech.',
    title: 'Resumen Vitam Tech',
  },
  'financial-analysis': {
    intent: 'financial-analysis',
    agentType: 'FINANCE',
    prompt: 'Realiza un análisis financiero ejecutivo.',
    title: 'Análisis financiero',
  },
  'sales-follow-up': {
    intent: 'sales-follow-up',
    agentType: 'SALES',
    prompt: 'Analiza el pipeline comercial y los seguimientos pendientes.',
    title: 'Seguimiento comercial',
  },
  'project-risks': {
    intent: 'project-risks',
    agentType: 'PROJECT',
    prompt: 'Analiza los riesgos de proyectos y tareas.',
    title: 'Riesgos de proyectos',
  },
  'weekly-plan': {
    intent: 'weekly-plan',
    agentType: 'EXECUTIVE',
    prompt: 'Prepara un plan semanal recomendado.',
    title: 'Plan semanal recomendado',
  },
};

export async function quickAction(
  action: string,
  organizationId?: string | null,
) {
  const cfg = QUICK_ACTIONS[action];
  if (!cfg) throw badRequest('Acción rápida no válida');
  return chat({
    agentType: cfg.agentType,
    organizationId: organizationId ?? null,
    message: cfg.prompt,
    intent: cfg.intent,
    title: cfg.title,
  });
}

export async function listConversations() {
  return prisma.agentConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
    take: 100,
  });
}

export async function getConversation(id: string) {
  const conversation = await prisma.agentConversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) throw notFound('Conversación no encontrada');
  return conversation;
}

export function getStatus() {
  return {
    enabled: isAgentEnabled(),
    provider: providerName(),
    model: env.AGENT_MODEL,
    allowWriteActions: env.AGENT_ALLOW_WRITE_ACTIONS,
  };
}

function buildTitle(message: string): string {
  const t = message.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || 'Conversación';
}
