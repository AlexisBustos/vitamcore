import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './income.controller';

export const incomeRouter = Router();

incomeRouter.get('/', asyncHandler(listController));
incomeRouter.post('/', asyncHandler(createController));
incomeRouter.get('/:id', asyncHandler(getController));
incomeRouter.patch('/:id', asyncHandler(updateController));
incomeRouter.delete('/:id', asyncHandler(removeController));
