/**
 * Controlador del motor de alertas. Solo expone la ejecución manual
 * (el listado de alertas se consume vía /agent/insights?status=NEW).
 */
import type { Request, Response } from 'express';
import { generateAlerts } from './alerts.service';

export async function runAlertsController(_req: Request, res: Response) {
  const result = await generateAlerts();
  res.json({ data: result });
}
