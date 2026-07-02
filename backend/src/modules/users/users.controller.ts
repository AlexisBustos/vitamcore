import type { Request, Response } from 'express';
import { createUserSchema, updateUserSchema } from './users.schema';
import * as service from './users.service';

export async function listUsersController(_req: Request, res: Response) {
  res.json({ data: await service.listUsers() });
}

export async function createUserController(req: Request, res: Response) {
  const input = createUserSchema.parse(req.body);
  res.status(201).json({ data: await service.createUser(input) });
}

export async function updateUserController(req: Request, res: Response) {
  const input = updateUserSchema.parse(req.body);
  // requireAuth garantiza req.user; se pasa para las reglas anti-auto-bloqueo.
  res.json({ data: await service.updateUser(req.params.id, input, req.user!.id) });
}
