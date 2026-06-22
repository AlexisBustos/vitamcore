import type { Request, Response } from 'express';
import {
  createDecisionSchema,
  listDecisionsQuery,
  updateDecisionSchema,
} from './decisions.schema';
import * as service from './decisions.service';

export async function listController(req: Request, res: Response) {
  const filters = listDecisionsQuery.parse(req.query);
  res.json({ data: await service.list(filters) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const input = createDecisionSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateDecisionSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}
