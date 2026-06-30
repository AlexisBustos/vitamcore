import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './finance.service';
import { autoReconcileSchema, consolidatedQuery } from './finance.schema';

const summaryQuery = z.object({ organizationId: z.string().optional() });

export async function summaryController(req: Request, res: Response) {
  const { organizationId } = summaryQuery.parse(req.query);
  res.json({ data: await service.getSummary(organizationId) });
}

export async function consolidatedController(req: Request, res: Response) {
  const filters = consolidatedQuery.parse(req.query);
  res.json({ data: await service.getConsolidated(filters) });
}

export async function autoReconcileController(req: Request, res: Response) {
  const input = autoReconcileSchema.parse(req.body);
  res.json({ data: await service.autoReconcile(input) });
}
