import type { Request, Response } from 'express';
import { listVendorsQuery } from './vendors.schema';
import * as service from './vendors.service';

export async function listVendorsController(req: Request, res: Response) {
  const filters = listVendorsQuery.parse(req.query);
  res.json({ data: await service.listVendors(filters) });
}

export async function getVendorController(req: Request, res: Response) {
  res.json({ data: await service.getVendor(req.params.id) });
}
