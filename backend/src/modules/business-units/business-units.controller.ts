import type { Request, Response } from 'express';
import {
  createBusinessUnitSchema,
  listBusinessUnitsQuery,
  updateBusinessUnitSchema,
} from './business-units.schema';
import * as service from './business-units.service';

export async function listController(req: Request, res: Response) {
  const filters = listBusinessUnitsQuery.parse(req.query);
  res.json({ data: await service.list(filters) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const input = createBusinessUnitSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateBusinessUnitSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}
