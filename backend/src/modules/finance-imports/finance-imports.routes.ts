import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/async-handler';
import {
  confirmController,
  createAccountController,
  getBatchController,
  listAccountsController,
  listBatchesController,
  listTransactionMonthsController,
  listTransactionsController,
  previewController,
  updateAccountController,
} from './finance-imports.controller';

export const financeImportsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

financeImportsRouter.get('/accounts', asyncHandler(listAccountsController));
financeImportsRouter.post('/accounts', asyncHandler(createAccountController));
financeImportsRouter.patch('/accounts/:id', asyncHandler(updateAccountController));
financeImportsRouter.post(
  '/preview',
  upload.single('file'),
  asyncHandler(previewController),
);
financeImportsRouter.post('/confirm', asyncHandler(confirmController));
financeImportsRouter.get('/batches', asyncHandler(listBatchesController));
financeImportsRouter.get('/batches/:id', asyncHandler(getBatchController));
financeImportsRouter.get(
  '/transactions/months',
  asyncHandler(listTransactionMonthsController),
);
financeImportsRouter.get('/transactions', asyncHandler(listTransactionsController));
