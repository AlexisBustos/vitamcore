import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { runAlertsController } from './alerts.controller';

export const alertsRouter = Router();

// Ejecuta el motor de alertas ahora (reconcilia insights del motor).
alertsRouter.post('/run', asyncHandler(runAlertsController));
