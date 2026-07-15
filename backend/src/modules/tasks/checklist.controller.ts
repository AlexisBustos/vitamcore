import type { Request, Response } from 'express';
import { createChecklistItemSchema, updateChecklistItemSchema } from './checklist.schema';
import * as service from './checklist.service';

export async function addItemController(req: Request, res: Response) {
  const input = createChecklistItemSchema.parse(req.body);
  res.status(201).json({ data: await service.addItem(req.params.id, input, req.user) });
}
export async function updateItemController(req: Request, res: Response) {
  const input = updateChecklistItemSchema.parse(req.body);
  res.json({
    data: await service.updateItem(req.params.id, req.params.itemId, input, req.user),
  });
}
export async function removeItemController(req: Request, res: Response) {
  await service.removeItem(req.params.id, req.params.itemId, req.user);
  res.json({ ok: true });
}
