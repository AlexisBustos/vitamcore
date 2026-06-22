import type { Request, Response } from 'express';
import { z } from 'zod';
import { createSalesSchema, listSalesQuery, updateSalesSchema } from './sales.schema';
import * as service from './sales.service';

const summaryQuery = z.object({ organizationId: z.string().optional() });

export async function listController(req: Request, res: Response) {
  const filters = listSalesQuery.parse(req.query);
  res.json({ data: await service.list(filters) });
}

export async function summaryController(req: Request, res: Response) {
  const { organizationId } = summaryQuery.parse(req.query);
  res.json({ data: await service.getSummary(organizationId) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const input = createSalesSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateSalesSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}
