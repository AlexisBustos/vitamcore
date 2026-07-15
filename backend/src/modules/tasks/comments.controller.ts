import type { Request, Response } from 'express';
import { createCommentSchema } from './comments.schema';
import * as service from './comments.service';

export async function listCommentsController(req: Request, res: Response) {
  res.json({ data: await service.list(req.params.id, req.user) });
}

export async function createCommentController(req: Request, res: Response) {
  const input = createCommentSchema.parse(req.body);
  res
    .status(201)
    .json({ data: await service.create(req.params.id, input, req.user!.id, req.user) });
}
