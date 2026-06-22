import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './dashboard.service';

const querySchema = z.object({
  organizationId: z.string().optional(),
});

export async function summaryController(req: Request, res: Response) {
  const { organizationId } = querySchema.parse(req.query);
  res.json({ data: await service.getSummary(organizationId) });
}
