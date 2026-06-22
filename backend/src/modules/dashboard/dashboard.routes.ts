import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { summaryController } from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', asyncHandler(summaryController));
