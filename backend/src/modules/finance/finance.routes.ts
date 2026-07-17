import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  autoReconcileController,
  consolidatedController,
  recognizeTransfersController,
  summaryController,
  trendController,
} from './finance.controller';

export const financeRouter = Router();

financeRouter.get('/summary', asyncHandler(summaryController));
financeRouter.get('/consolidated', asyncHandler(consolidatedController));
financeRouter.get('/trend', asyncHandler(trendController));
financeRouter.post('/reconciliation/auto', asyncHandler(autoReconcileController));
financeRouter.post(
  '/reconciliation/recognize-transfers',
  asyncHandler(recognizeTransfersController),
);
