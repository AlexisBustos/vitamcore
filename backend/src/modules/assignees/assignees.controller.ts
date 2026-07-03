import type { Request, Response } from 'express';
import * as service from './assignees.service';

export async function listAssigneesController(_req: Request, res: Response) {
  res.json({ data: await service.listAssignables() });
}
