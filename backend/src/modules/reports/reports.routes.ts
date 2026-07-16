import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  previewWeeklyController,
  sendWeeklyController,
} from './reports.controller';

export const reportsRouter = Router();

// Previsualizar el informe semanal (sin persistir ni enviar).
reportsRouter.get('/weekly/preview', asyncHandler(previewWeeklyController));
// Generar, persistir y enviar el informe semanal ahora (disparo manual).
reportsRouter.post('/weekly/send', asyncHandler(sendWeeklyController));
