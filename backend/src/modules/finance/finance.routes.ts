import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  autoReconcileController,
  consolidatedController,
  summaryController,
} from './finance.controller';

export const financeRouter = Router();

financeRouter.get('/summary', asyncHandler(summaryController));
financeRouter.get('/consolidated', asyncHandler(consolidatedController));
financeRouter.post('/reconciliation/auto', asyncHandler(autoReconcileController));
