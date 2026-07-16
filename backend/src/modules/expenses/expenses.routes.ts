import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  bulkRegisterPaymentController,
  createController,
  getController,
  listController,
  listPeriodsController,
  registerPaymentController,
  removeController,
  updateController,
} from './expenses.controller';

export const expensesRouter = Router();

expensesRouter.get('/', asyncHandler(listController));
expensesRouter.get('/periods', asyncHandler(listPeriodsController));
expensesRouter.post('/', asyncHandler(createController));
expensesRouter.post('/payments/bulk', asyncHandler(bulkRegisterPaymentController));
expensesRouter.patch('/:id/payment', asyncHandler(registerPaymentController));
expensesRouter.get('/:id', asyncHandler(getController));
expensesRouter.patch('/:id', asyncHandler(updateController));
expensesRouter.delete('/:id', asyncHandler(removeController));
