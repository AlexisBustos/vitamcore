import type { Request, Response } from 'express';
import {
  createTaskSchema,
  listTasksQuery,
  updateTaskSchema,
} from './tasks.schema';
import * as service from './tasks.service';

export async function listController(req: Request, res: Response) {
  const filters = listTasksQuery.parse(req.query);
  res.json({ data: await service.list(filters, req.user) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id, req.user) });
}

export async function createController(req: Request, res: Response) {
  const input = createTaskSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input, req.user) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateTaskSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input, req.user) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id, req.user);
  res.json({ ok: true });
}
