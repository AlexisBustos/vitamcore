import type { Request, Response } from 'express';
import * as orchestrator from './orchestrator';
import * as service from './agent.service';
import {
  chatSchema,
  createInsightSchema,
  createProposedTaskSchema,
  createReportSchema,
  listInsightsQuery,
  listProposedTasksQuery,
  listReportsQuery,
  quickActionQuery,
  updateInsightStatusSchema,
} from './agent.schema';

// --- Estado / chat / conversaciones ---

export async function statusController(_req: Request, res: Response) {
  res.json({ data: orchestrator.getStatus() });
}

export async function chatController(req: Request, res: Response) {
  const input = chatSchema.parse(req.body);
  res.json({ data: await orchestrator.chat(input) });
}

export async function listConversationsController(_req: Request, res: Response) {
  res.json({ data: await orchestrator.listConversations() });
}

export async function getConversationController(req: Request, res: Response) {
  res.json({ data: await orchestrator.getConversation(req.params.id) });
}

// --- Acciones rápidas ---

export function quickActionController(action: string) {
  return async (req: Request, res: Response) => {
    const { organizationId } = quickActionQuery.parse(req.query);
    res.json({ data: await orchestrator.quickAction(action, organizationId) });
  };
}

// --- Insights ---

export async function listInsightsController(req: Request, res: Response) {
  const filters = listInsightsQuery.parse(req.query);
  res.json({ data: await service.listInsights(filters) });
}

export async function createInsightController(req: Request, res: Response) {
  const input = createInsightSchema.parse(req.body);
  res.status(201).json({ data: await service.createInsight(input) });
}

export async function updateInsightStatusController(
  req: Request,
  res: Response,
) {
  const { status } = updateInsightStatusSchema.parse(req.body);
  res.json({ data: await service.updateInsightStatus(req.params.id, status) });
}

// --- Tareas propuestas ---

export async function listProposedTasksController(req: Request, res: Response) {
  const filters = listProposedTasksQuery.parse(req.query);
  res.json({ data: await service.listProposedTasks(filters) });
}

export async function createProposedTaskController(req: Request, res: Response) {
  const input = createProposedTaskSchema.parse(req.body);
  res.status(201).json({ data: await service.createProposedTask(input) });
}

export async function approveProposedTaskController(
  req: Request,
  res: Response,
) {
  res.json({ data: await service.approveProposedTask(req.params.id) });
}

export async function rejectProposedTaskController(req: Request, res: Response) {
  res.json({ data: await service.rejectProposedTask(req.params.id) });
}

export async function convertProposedTaskController(
  req: Request,
  res: Response,
) {
  res.json({ data: await service.convertProposedTask(req.params.id) });
}

// --- Reportes ---

export async function listReportsController(req: Request, res: Response) {
  const filters = listReportsQuery.parse(req.query);
  res.json({ data: await service.listReports(filters) });
}

export async function createReportController(req: Request, res: Response) {
  const input = createReportSchema.parse(req.body);
  res.status(201).json({ data: await service.createReport(input) });
}
