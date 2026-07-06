/**
 * Servicio del Agent Layer: insights, tareas propuestas y reportes.
 * El chat y las acciones rápidas viven en el orchestrator.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../utils/http-error';
import { create as createTask } from '../tasks/tasks.service';
import { getProvider } from './providers';
import type {
  createInsightSchema,
  createProposedTaskSchema,
  createReportSchema,
} from './agent.schema';
import { z } from 'zod';

// ---- Insights ----

interface InsightFilters {
  organizationId?: string;
  agentType?: any;
  type?: any;
  status?: any;
  priority?: any;
}

export function listInsights(filters: InsightFilters) {
  return prisma.agentInsight.findMany({
    where: {
      organizationId: filters.organizationId,
      agentType: filters.agentType,
      type: filters.type,
      status: filters.status,
      priority: filters.priority,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export function createInsight(input: z.infer<typeof createInsightSchema>) {
  return prisma.agentInsight.create({
    data: {
      title: input.title,
      summary: input.summary,
      type: input.type,
      priority: input.priority,
      evidence: input.evidence ?? null,
      recommendation: input.recommendation ?? null,
      agentType: input.agentType,
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      sourceData: (input.sourceData as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function updateInsightStatus(id: string, status: any) {
  await ensureInsight(id);
  return prisma.agentInsight.update({ where: { id }, data: { status } });
}

async function ensureInsight(id: string) {
  const e = await prisma.agentInsight.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!e) throw notFound('Insight no encontrado');
}

// ---- Tareas propuestas ----

export function listProposedTasks(filters: {
  organizationId?: string;
  status?: any;
}) {
  return prisma.agentProposedTask.findMany({
    where: { organizationId: filters.organizationId, status: filters.status },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export function createProposedTask(
  input: z.infer<typeof createProposedTaskSchema>,
) {
  return prisma.agentProposedTask.create({
    data: {
      organizationId: input.organizationId,
      businessUnitId: input.businessUnitId ?? null,
      projectId: input.projectId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      rationale: input.rationale ?? null,
      sourceInsightId: input.sourceInsightId ?? null,
      status: 'PROPOSED',
    },
  });
}

export async function approveProposedTask(id: string) {
  const t = await getProposed(id);
  if (t.status === 'CONVERTED_TO_TASK') {
    throw badRequest('La tarea ya fue convertida en tarea real');
  }
  return prisma.agentProposedTask.update({
    where: { id },
    data: { status: 'APPROVED' },
  });
}

export async function rejectProposedTask(id: string) {
  await getProposed(id);
  return prisma.agentProposedTask.update({
    where: { id },
    data: { status: 'REJECTED' },
  });
}

/** Convierte una tarea propuesta en una tarea real (acción del usuario). */
export async function convertProposedTask(id: string) {
  const proposed = await getProposed(id);
  if (proposed.status === 'CONVERTED_TO_TASK') {
    throw badRequest('La tarea ya fue convertida');
  }
  if (proposed.status === 'REJECTED') {
    throw badRequest('La tarea fue rechazada y no puede convertirse');
  }

  // tasks.service valida la coherencia empresa/unidad/proyecto.
  const task = await createTask({
    organizationId: proposed.organizationId,
    businessUnitId: proposed.businessUnitId,
    projectId: proposed.projectId,
    title: proposed.title,
    description: proposed.description,
    status: 'TODO',
    priority: proposed.priority,
    dueDate: proposed.dueDate,
    source: 'AI',
    notes: proposed.rationale ? `Propuesta por IA: ${proposed.rationale}` : null,
  });

  await prisma.agentProposedTask.update({
    where: { id },
    data: { status: 'CONVERTED_TO_TASK' },
  });

  return task;
}

async function getProposed(id: string) {
  const t = await prisma.agentProposedTask.findUnique({ where: { id } });
  if (!t) throw notFound('Tarea propuesta no encontrada');
  return t;
}

// ---- Reportes ejecutivos ----

export function listReports(filters: {
  organizationId?: string;
  reportType?: any;
}) {
  return prisma.executiveReport.findMany({
    where: {
      organizationId: filters.organizationId,
      reportType: filters.reportType,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createReport(
  input: z.infer<typeof createReportSchema>,
) {
  let content = input.content ?? '';
  let sections = { highlights: null, risks: null, recommendations: null, nextActions: null } as Record<
    string,
    string | null
  >;

  if (input.generate || !content) {
    const provider = getProvider();
    const result = await provider.run({
      agentType: 'EXECUTIVE',
      message: input.organizationId
        ? 'Genera un reporte ejecutivo de la empresa.'
        : 'Genera un reporte ejecutivo consolidado.',
      organizationId: input.organizationId ?? null,
      allowWrite: env.AGENT_ALLOW_WRITE_ACTIONS,
      intent: 'executive-summary',
    });
    content = result.content;
    sections = parseSections(content);
  }

  return prisma.executiveReport.create({
    data: {
      title: input.title ?? defaultTitle(input.reportType),
      reportType: input.reportType,
      organizationId: input.organizationId ?? null,
      content,
      highlights: sections.highlights,
      risks: sections.risks,
      recommendations: sections.recommendations,
      nextActions: sections.nextActions,
      periodEnd: new Date(),
    },
  });
}

function defaultTitle(type: string): string {
  const today = new Date().toLocaleDateString('es-CL');
  return `Reporte ${type.toLowerCase()} — ${today}`;
}

/** Extrae secciones del contenido con formato de 6 bloques. */
function parseSections(content: string) {
  const grab = (re: RegExp) => {
    const m = content.match(re);
    return m ? m[1].trim() : null;
  };
  return {
    highlights: grab(/Resumen ejecutivo\s*([\s\S]*?)(?=\n##|\n#|$)/i),
    risks: grab(/Riesgos o alertas\s*([\s\S]*?)(?=\n##|\n#|$)/i),
    recommendations: grab(/Recomendaciones\s*([\s\S]*?)(?=\n##|\n#|$)/i),
    nextActions: grab(/Próximas acciones[^\n]*\s*([\s\S]*?)(?=\n##|\n#|$)/i),
  };
}
