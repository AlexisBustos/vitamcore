import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './expenses.controller';

export const expensesRouter = Router();

expensesRouter.get('/', asyncHandler(listController));
expensesRouter.post('/', asyncHandler(createController));
expensesRouter.get('/:id', asyncHandler(getController));
expensesRouter.patch('/:id', asyncHandler(updateController));
expensesRouter.delete('/:id', asyncHandler(removeController));
