import type { Request, Response } from 'express';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from './organizations.schema';
import * as service from './organizations.service';

export async function listController(_req: Request, res: Response) {
  res.json({ data: await service.list() });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id, req.user) });
}

export async function createController(req: Request, res: Response) {
  const input = createOrganizationSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateOrganizationSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}
