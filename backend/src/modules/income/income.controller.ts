import type { Request, Response } from 'express';
import {
  bulkRegisterPaymentSchema,
  createIncomeSchema,
  listIncomeQuery,
  registerPaymentSchema,
  updateIncomeSchema,
} from './income.schema';
import * as service from './income.service';

export async function listController(req: Request, res: Response) {
  const filters = listIncomeQuery.parse(req.query);
  res.json({ data: await service.list(filters) });
}

export async function listMonthsController(req: Request, res: Response) {
  const { organizationId } = listIncomeQuery.pick({ organizationId: true }).parse(req.query);
  res.json({ data: await service.listMonths(organizationId) });
}

export async function getController(req: Request, res: Response) {
  res.json({ data: await service.getById(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const input = createIncomeSchema.parse(req.body);
  res.status(201).json({ data: await service.create(input) });
}

export async function updateController(req: Request, res: Response) {
  const input = updateIncomeSchema.parse(req.body);
  res.json({ data: await service.update(req.params.id, input) });
}

export async function removeController(req: Request, res: Response) {
  await service.remove(req.params.id);
  res.json({ ok: true });
}

export async function registerPaymentController(req: Request, res: Response) {
  const input = registerPaymentSchema.parse(req.body);
  res.json({ data: await service.registerPayment(req.params.id, input) });
}

export async function bulkRegisterPaymentController(req: Request, res: Response) {
  const input = bulkRegisterPaymentSchema.parse(req.body);
  res.json({ data: await service.bulkRegisterPayment(input) });
}
