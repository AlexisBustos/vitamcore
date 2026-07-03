import type { Request, Response } from 'express';
import { createLabelSchema, listLabelsQuery, updateLabelSchema } from './labels.schema';
import * as service from './labels.service';

export async function listController(req: Request, res: Response) {
  res.json({ data: await service.list(listLabelsQuery.parse(req.query)) });
}
export async function createController(req: Request, res: Response) {
  res.status(201).json({ data: await service.create(createLabelSchema.parse(req.body)) });
}
export async function updateController(req: Request, res: Response) {
  res.json({ data: await service.update(req.params.id, updateLabelSchema.parse(req.body)) });
}
export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}
