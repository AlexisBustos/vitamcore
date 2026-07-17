import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  approveProposedTaskController,
  chatController,
  convertProposedTaskController,
  createInsightController,
  createProposedTaskController,
  createReportController,
  getConversationController,
  listConversationsController,
  listInsightsController,
  listProposedTasksController,
  listReportsController,
  quickActionController,
  rejectProposedTaskController,
  statusController,
  updateInsightStatusController,
} from './agent.controller';

export const agentRouter = Router();

// Estado del agente (provider, modelo, flags).
agentRouter.get('/status', asyncHandler(statusController));

// Chat y conversaciones.
agentRouter.post('/chat', asyncHandler(chatController));
agentRouter.get('/conversations', asyncHandler(listConversationsController));
agentRouter.get('/conversations/:id', asyncHandler(getConversationController));

// Acciones rápidas.
agentRouter.post(
  '/quick-actions/executive-summary',
  asyncHandler(quickActionController('executive-summary')),
);
agentRouter.post(
  '/quick-actions/healthcare-summary',
  asyncHandler(quickActionController('healthcare-summary')),
);
agentRouter.post(
  '/quick-actions/tech-summary',
  asyncHandler(quickActionController('tech-summary')),
);
agentRouter.post(
  '/quick-actions/financial-analysis',
  asyncHandler(quickActionController('financial-analysis')),
);
agentRouter.post(
  '/quick-actions/project-risks',
  asyncHandler(quickActionController('project-risks')),
);
agentRouter.post(
  '/quick-actions/weekly-plan',
  asyncHandler(quickActionController('weekly-plan')),
);

// Insights.
agentRouter.get('/insights', asyncHandler(listInsightsController));
agentRouter.post('/insights', asyncHandler(createInsightController));
agentRouter.patch(
  '/insights/:id/status',
  asyncHandler(updateInsightStatusController),
);

// Tareas propuestas.
agentRouter.get('/proposed-tasks', asyncHandler(listProposedTasksController));
agentRouter.post('/proposed-tasks', asyncHandler(createProposedTaskController));
agentRouter.post(
  '/proposed-tasks/:id/approve',
  asyncHandler(approveProposedTaskController),
);
agentRouter.post(
  '/proposed-tasks/:id/reject',
  asyncHandler(rejectProposedTaskController),
);
agentRouter.post(
  '/proposed-tasks/:id/convert',
  asyncHandler(convertProposedTaskController),
);

// Reportes ejecutivos.
agentRouter.get('/reports', asyncHandler(listReportsController));
agentRouter.post('/reports', asyncHandler(createReportController));
