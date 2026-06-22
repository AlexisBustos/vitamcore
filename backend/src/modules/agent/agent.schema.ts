import { z } from 'zod';

export const agentTypeEnum = z.enum([
  'EXECUTIVE',
  'FINANCE',
  'SALES',
  'PROJECT',
  'DOCUMENT',
  'STRATEGY',
  'GENERAL',
]);

export const insightTypeEnum = z.enum([
  'EXECUTIVE_SUMMARY',
  'RISK',
  'FINANCIAL',
  'SALES',
  'PROJECT',
  'TASK',
  'DECISION',
  'DOCUMENT',
  'STRATEGY',
  'GENERAL',
]);

export const insightStatusEnum = z.enum([
  'NEW',
  'REVIEWED',
  'DISMISSED',
  'ACTIONED',
]);

const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const chatSchema = z.object({
  conversationId: z.string().optional(),
  agentType: agentTypeEnum.default('EXECUTIVE'),
  organizationId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  message: z.string().trim().min(1, 'El mensaje es obligatorio'),
});

export const quickActionQuery = z.object({
  organizationId: z.string().optional().nullable(),
});

export const createInsightSchema = z.object({
  title: z.string().trim().min(2),
  summary: z.string().trim().min(2),
  type: insightTypeEnum.default('GENERAL'),
  priority: priorityEnum.default('MEDIUM'),
  evidence: z.string().optional().nullable(),
  recommendation: z.string().optional().nullable(),
  agentType: agentTypeEnum.default('EXECUTIVE'),
  organizationId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  sourceData: z.any().optional(),
});

export const listInsightsQuery = z.object({
  organizationId: z.string().optional(),
  agentType: agentTypeEnum.optional(),
  type: insightTypeEnum.optional(),
  status: insightStatusEnum.optional(),
  priority: priorityEnum.optional(),
});

export const updateInsightStatusSchema = z.object({
  status: insightStatusEnum,
});

export const createProposedTaskSchema = z.object({
  organizationId: z.string().min(1),
  businessUnitId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  title: z.string().trim().min(2),
  description: z.string().optional().nullable(),
  priority: priorityEnum.default('MEDIUM'),
  dueDate: z
    .union([z.coerce.date(), z.literal('').transform(() => null)])
    .optional()
    .nullable(),
  rationale: z.string().optional().nullable(),
  sourceInsightId: z.string().optional().nullable(),
});

export const listProposedTasksQuery = z.object({
  organizationId: z.string().optional(),
  status: z
    .enum(['PROPOSED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_TASK'])
    .optional(),
});

export const reportTypeEnum = z.enum([
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CONSOLIDATED',
  'ORGANIZATION_SPECIFIC',
  'CUSTOM',
]);

export const createReportSchema = z.object({
  title: z.string().trim().min(2).optional(),
  reportType: reportTypeEnum.default('CONSOLIDATED'),
  organizationId: z.string().optional().nullable(),
  // Si es true (default), el agente genera el contenido con datos reales.
  generate: z.boolean().default(true),
  content: z.string().optional(),
});

export const listReportsQuery = z.object({
  organizationId: z.string().optional(),
  reportType: reportTypeEnum.optional(),
});
