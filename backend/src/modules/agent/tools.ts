/**
 * Internal Tools del Agent Layer.
 *
 * Herramientas que el agente puede usar para CONSULTAR información real de
 * VITAM CORE (read tools) y para registrar resultados controlados (write tools).
 *
 * Reglas de seguridad:
 *  - Las write tools solo crean insights, tareas PROPUESTAS y reportes.
 *  - No existen tools para borrar ni modificar finanzas, ni marcar
 *    decisiones como implementadas.
 *  - Las write tools solo se exponen al modelo si AGENT_ALLOW_WRITE_ACTIONS=true.
 */
import type {
  AgentType,
  InsightType,
  Prisma,
  Priority,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { getSummary as getFinanceSummary } from '../finance/finance.service';

const MAX = env.AGENT_MAX_CONTEXT_ITEMS;

const refs = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

export interface ToolContext {
  agentType: AgentType;
  organizationId?: string | null;
  projectId?: string | null;
}

export interface InternalTool {
  /** Definición para el proveedor LLM (formato Anthropic tools). */
  def: {
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  write?: boolean;
  handler: (input: Record<string, any>, ctx: ToolContext) => Promise<unknown>;
}

// ---------------------------------------------------------
// READ TOOLS
// ---------------------------------------------------------

const getOrganizations: InternalTool = {
  def: {
    name: 'getOrganizations',
    description:
      'Devuelve las empresas (Vitam Healthcare, Vitam Tech) con sus datos principales y conteos.',
    input_schema: { type: 'object', properties: {} },
  },
  handler: () =>
    prisma.organization.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { businessUnits: true, projects: true, tasks: true },
        },
      },
    }),
};

const getBusinessUnits: InternalTool = {
  def: {
    name: 'getBusinessUnits',
    description: 'Consulta las unidades de negocio, opcionalmente por empresa.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'ID de la empresa' },
      },
    },
  },
  handler: (input) =>
    prisma.businessUnit.findMany({
      where: { organizationId: input.organizationId || undefined },
      orderBy: { name: 'asc' },
      include: { organization: refs.organization },
      take: MAX,
    }),
};

const getProjects: InternalTool = {
  def: {
    name: 'getProjects',
    description:
      'Consulta proyectos con filtros por empresa, unidad, estado y prioridad.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        businessUnitId: { type: 'string' },
        status: {
          type: 'string',
          enum: [
            'IDEA', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW',
            'COMPLETED', 'PAUSED', 'CANCELLED',
          ],
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
      },
    },
  },
  handler: (input) =>
    prisma.project.findMany({
      where: {
        organizationId: input.organizationId || undefined,
        businessUnitId: input.businessUnitId || undefined,
        status: input.status || undefined,
        priority: input.priority || undefined,
      },
      orderBy: { updatedAt: 'desc' },
      include: { ...refs, _count: { select: { tasks: true } } },
      take: MAX,
    }),
};

const getTasks: InternalTool = {
  def: {
    name: 'getTasks',
    description:
      'Consulta tareas con filtros por empresa, proyecto, estado, prioridad y vencidas.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['TODO', 'DOING', 'DONE'],
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        overdue: { type: 'boolean', description: 'Solo tareas vencidas y abiertas' },
      },
    },
  },
  handler: (input) => {
    const where: Prisma.TaskWhereInput = {
      organizationId: input.organizationId || undefined,
      projectId: input.projectId || undefined,
      status: input.status || undefined,
      priority: input.priority || undefined,
    };
    if (input.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { not: 'DONE' };
    }
    return prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: refs,
      take: MAX,
    });
  },
};

const getFinancialSummary: InternalTool = {
  def: {
    name: 'getFinancialSummary',
    description:
      'Resumen financiero: ingresos/gastos del mes, resultado, pendientes, vencidos, por empresa y categoría.',
    input_schema: {
      type: 'object',
      properties: { organizationId: { type: 'string' } },
    },
  },
  handler: (input) => getFinanceSummary(input.organizationId || undefined),
};

const getIncomeRecords: InternalTool = {
  def: {
    name: 'getIncomeRecords',
    description: 'Consulta ingresos con filtros por empresa, estado y categoría.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['EXPECTED', 'INVOICED', 'PAID', 'OVERDUE', 'CANCELLED'],
        },
        category: { type: 'string' },
      },
    },
  },
  handler: (input) =>
    prisma.incomeRecord.findMany({
      where: {
        organizationId: input.organizationId || undefined,
        status: input.status || undefined,
        category: input.category || undefined,
      },
      orderBy: { incomeDate: 'desc' },
      include: refs,
      take: MAX,
    }),
};

const getExpenseRecords: InternalTool = {
  def: {
    name: 'getExpenseRecords',
    description: 'Consulta gastos con filtros por empresa, estado y categoría.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'],
        },
        category: { type: 'string' },
      },
    },
  },
  handler: (input) =>
    prisma.expenseRecord.findMany({
      where: {
        organizationId: input.organizationId || undefined,
        status: input.status || undefined,
        category: input.category || undefined,
      },
      orderBy: { expenseDate: 'desc' },
      include: refs,
      take: MAX,
    }),
};

const getDocuments: InternalTool = {
  def: {
    name: 'getDocuments',
    description:
      'Consulta documentos con filtros por empresa, proyecto, tipo y cliente. Incluye aiSummary si existe.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
        documentType: { type: 'string' },
        clientName: { type: 'string' },
      },
    },
  },
  handler: (input) =>
    prisma.document.findMany({
      where: {
        organizationId: input.organizationId || undefined,
        projectId: input.projectId || undefined,
        documentType: input.documentType || undefined,
        clientName: input.clientName
          ? { contains: input.clientName, mode: 'insensitive' }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: refs,
      take: MAX,
    }),
};

const getStrategicDecisions: InternalTool = {
  def: {
    name: 'getStrategicDecisions',
    description:
      'Consulta decisiones estratégicas con filtros por empresa, proyecto y estado.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['DRAFT', 'ACTIVE', 'IMPLEMENTED', 'REVISIT', 'CANCELLED'],
        },
      },
    },
  },
  handler: (input) =>
    prisma.strategicDecision.findMany({
      where: {
        organizationId: input.organizationId || undefined,
        projectId: input.projectId || undefined,
        status: input.status || undefined,
      },
      orderBy: { decisionDate: 'desc' },
      include: refs,
      take: MAX,
    }),
};

// ---------------------------------------------------------
// WRITE TOOLS (controladas, no destructivas)
// ---------------------------------------------------------

const createAIInsight: InternalTool = {
  write: true,
  def: {
    name: 'createAIInsight',
    description:
      'Guarda un insight (hallazgo o recomendación). No ejecuta ninguna acción operativa.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        type: {
          type: 'string',
          enum: [
            'EXECUTIVE_SUMMARY', 'RISK', 'FINANCIAL', 'SALES', 'PROJECT',
            'TASK', 'DECISION', 'DOCUMENT', 'STRATEGY', 'GENERAL',
          ],
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        evidence: { type: 'string' },
        recommendation: { type: 'string' },
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['title', 'summary'],
    },
  },
  handler: (input, ctx) =>
    prisma.agentInsight.create({
      data: {
        title: input.title,
        summary: input.summary,
        type: (input.type as InsightType) ?? 'GENERAL',
        priority: (input.priority as Priority) ?? 'MEDIUM',
        evidence: input.evidence ?? null,
        recommendation: input.recommendation ?? null,
        agentType: ctx.agentType,
        organizationId: input.organizationId ?? ctx.organizationId ?? null,
        projectId: input.projectId ?? ctx.projectId ?? null,
      },
    }),
};

const proposeTask: InternalTool = {
  write: true,
  def: {
    name: 'proposeTask',
    description:
      'Propone una tarea. Queda en estado PROPOSED hasta que el usuario la apruebe. NO crea una tarea real.',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        rationale: { type: 'string' },
        businessUnitId: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['organizationId', 'title'],
    },
  },
  handler: (input, ctx) =>
    prisma.agentProposedTask.create({
      data: {
        organizationId: input.organizationId ?? ctx.organizationId ?? '',
        title: input.title,
        description: input.description ?? null,
        priority: (input.priority as Priority) ?? 'MEDIUM',
        rationale: input.rationale ?? null,
        businessUnitId: input.businessUnitId ?? null,
        projectId: input.projectId ?? ctx.projectId ?? null,
        status: 'PROPOSED',
      },
    }),
};

const createExecutiveReport: InternalTool = {
  write: true,
  def: {
    name: 'createExecutiveReport',
    description: 'Guarda un reporte ejecutivo generado por el agente.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        reportType: {
          type: 'string',
          enum: [
            'DAILY', 'WEEKLY', 'MONTHLY', 'CONSOLIDATED',
            'ORGANIZATION_SPECIFIC', 'CUSTOM',
          ],
        },
        content: { type: 'string' },
        highlights: { type: 'string' },
        risks: { type: 'string' },
        recommendations: { type: 'string' },
        nextActions: { type: 'string' },
        organizationId: { type: 'string' },
      },
      required: ['title', 'content'],
    },
  },
  handler: (input, ctx) =>
    prisma.executiveReport.create({
      data: {
        title: input.title,
        content: input.content,
        reportType: input.reportType ?? 'CUSTOM',
        highlights: input.highlights ?? null,
        risks: input.risks ?? null,
        recommendations: input.recommendations ?? null,
        nextActions: input.nextActions ?? null,
        organizationId: input.organizationId ?? ctx.organizationId ?? null,
      },
    }),
};

export const READ_TOOLS: InternalTool[] = [
  getOrganizations,
  getBusinessUnits,
  getProjects,
  getTasks,
  getFinancialSummary,
  getIncomeRecords,
  getExpenseRecords,
  getDocuments,
  getStrategicDecisions,
];

export const WRITE_TOOLS: InternalTool[] = [
  createAIInsight,
  proposeTask,
  createExecutiveReport,
];

const ALL = [...READ_TOOLS, ...WRITE_TOOLS];

/** Devuelve las tools disponibles según si se permiten acciones de escritura. */
export function getAvailableTools(allowWrite: boolean): InternalTool[] {
  return allowWrite ? ALL : READ_TOOLS;
}

export function findTool(name: string): InternalTool | undefined {
  return ALL.find((t) => t.def.name === name);
}

/** Acceso directo a un read tool por nombre (para el proveedor heurístico). */
export async function callReadTool(
  name: string,
  input: Record<string, any>,
  ctx: ToolContext,
): Promise<any> {
  const tool = READ_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`Tool de lectura no encontrada: ${name}`);
  return tool.handler(input, ctx);
}
