import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { positionController, summaryController } from './finance.controller';

export const financeRouter = Router();

financeRouter.get('/summary', asyncHandler(summaryController));
financeRouter.get('/position', asyncHandler(positionController));
