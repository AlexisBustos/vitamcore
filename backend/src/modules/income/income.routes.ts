import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  bulkRegisterPaymentController,
  createController,
  getController,
  listController,
  listMonthsController,
  registerPaymentController,
  removeController,
  updateController,
} from './income.controller';

export const incomeRouter = Router();

incomeRouter.get('/', asyncHandler(listController));
incomeRouter.get('/months', asyncHandler(listMonthsController));
incomeRouter.post('/', asyncHandler(createController));
incomeRouter.post('/payments/bulk', asyncHandler(bulkRegisterPaymentController));
incomeRouter.get('/:id', asyncHandler(getController));
incomeRouter.patch('/:id/payment', asyncHandler(registerPaymentController));
incomeRouter.patch('/:id', asyncHandler(updateController));
incomeRouter.delete('/:id', asyncHandler(removeController));
