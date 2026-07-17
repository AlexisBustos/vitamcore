import type { Request, Response } from 'express';
import {
  bulkCategorySchema,
  confirmImportSchema,
  coverageQuery,
  createBankAccountSchema,
  listAccountsQuery,
  listBatchesQuery,
  listByCategoryQuery,
  listPeriodicQuery,
  listTransactionsQuery,
  previewImportSchema,
  reconciliationCandidatesQuery,
  setCategorySchema,
  updateBankAccountSchema,
} from './finance-imports.schema';
import * as service from './finance-imports.service';

export async function listAccountsController(req: Request, res: Response) {
  const filters = listAccountsQuery.parse(req.query);
  res.json({ data: await service.listBankAccounts(filters) });
}

export async function createAccountController(req: Request, res: Response) {
  const input = createBankAccountSchema.parse(req.body);
  res.status(201).json({ data: await service.createBankAccount(input) });
}

export async function updateAccountController(req: Request, res: Response) {
  const input = updateBankAccountSchema.parse(req.body);
  res.json({ data: await service.updateBankAccount(req.params.id, input) });
}

export async function previewController(req: Request, res: Response) {
  const input = previewImportSchema.parse(req.body);
  res.status(201).json({
    data: await service.previewImport(input, req.file),
  });
}

export async function confirmController(req: Request, res: Response) {
  const input = confirmImportSchema.parse(req.body);
  res.json({ data: await service.confirmImport(input.batchId) });
}

export async function coverageController(req: Request, res: Response) {
  const filters = coverageQuery.parse(req.query);
  res.json({ data: await service.getCoverage(filters) });
}

export async function listBatchesController(req: Request, res: Response) {
  const filters = listBatchesQuery.parse(req.query);
  res.json({ data: await service.listBatches(filters) });
}

export async function listTransactionsController(req: Request, res: Response) {
  const filters = listTransactionsQuery.parse(req.query);
  res.json({ data: await service.listBankTransactions(filters) });
}

export async function listByCategoryController(req: Request, res: Response) {
  const filters = listByCategoryQuery.parse(req.query);
  res.json({ data: await service.listBankByCategory(filters) });
}

export async function setCategoryController(req: Request, res: Response) {
  const input = setCategorySchema.parse(req.body);
  res.json({
    data: await service.setTransactionCategory(req.params.id, input.category),
  });
}

export async function bulkCategoryController(req: Request, res: Response) {
  const input = bulkCategorySchema.parse(req.body);
  res.json({ data: await service.setCategoryBulk(input.ids, input.category) });
}

export async function listTransactionPeriodsController(
  req: Request,
  res: Response,
) {
  const { granularity, ...filters } = listPeriodicQuery.parse(req.query);
  res.json({
    data: await service.listBankTransactionPeriods(granularity, filters),
  });
}

export async function listPeriodicController(req: Request, res: Response) {
  const { granularity, ...filters } = listPeriodicQuery.parse(req.query);
  res.json({ data: await service.listBankPeriodic(granularity, filters) });
}

export async function getBatchController(req: Request, res: Response) {
  res.json({ data: await service.getBatch(req.params.id) });
}

export async function reconciliationCandidatesController(req: Request, res: Response) {
  const filters = reconciliationCandidatesQuery.parse(req.query);
  res.json({ data: await service.listReconciliationCandidates(filters) });
}
