import type { Request, Response } from 'express';
import * as service from './finance.service';
import {
  autoReconcileSchema,
  consolidatedQuery,
  recognizeTransfersSchema,
  summaryQuery,
  trendQuery,
} from './finance.schema';

export async function summaryController(req: Request, res: Response) {
  const { organizationId, granularity, period } = summaryQuery.parse(req.query);
  res.json({
    data: await service.getSummary(organizationId, { granularity, period }),
  });
}

export async function consolidatedController(req: Request, res: Response) {
  const filters = consolidatedQuery.parse(req.query);
  res.json({ data: await service.getConsolidated(filters) });
}

export async function trendController(req: Request, res: Response) {
  const filters = trendQuery.parse(req.query);
  res.json({ data: await service.getTrend(filters) });
}

export async function autoReconcileController(req: Request, res: Response) {
  const input = autoReconcileSchema.parse(req.body);
  res.json({ data: await service.autoReconcile(input) });
}

export async function recognizeTransfersController(req: Request, res: Response) {
  const input = recognizeTransfersSchema.parse(req.body);
  res.json({ data: await service.recognizeTransfers(input) });
}
