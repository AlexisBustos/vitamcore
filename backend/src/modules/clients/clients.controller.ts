import type { Request, Response } from 'express';
import { listClientsQuery } from './clients.schema';
import * as service from './clients.service';

export async function listClientsController(req: Request, res: Response) {
  const filters = listClientsQuery.parse(req.query);
  res.json({ data: await service.listClients(filters) });
}

export async function getClientController(req: Request, res: Response) {
  res.json({ data: await service.getClient(req.params.id) });
}
