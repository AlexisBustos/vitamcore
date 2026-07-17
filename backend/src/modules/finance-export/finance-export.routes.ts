import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  exportBankController,
  exportExpensesController,
  exportIncomeController,
  exportReportController,
} from './finance-export.controller';

export const financeExportRouter = Router();

financeExportRouter.get('/income', asyncHandler(exportIncomeController));
financeExportRouter.get('/expenses', asyncHandler(exportExpensesController));
financeExportRouter.get('/bank', asyncHandler(exportBankController));
financeExportRouter.get('/report', asyncHandler(exportReportController));
