import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  summaryController,
  updateController,
} from './sales.controller';

export const salesRouter = Router();

salesRouter.get('/', asyncHandler(listController));
// /summary debe declararse antes de /:id para no ser capturado por el param.
salesRouter.get('/summary', asyncHandler(summaryController));
salesRouter.post('/', asyncHandler(createController));
salesRouter.get('/:id', asyncHandler(getController));
salesRouter.patch('/:id', asyncHandler(updateController));
salesRouter.delete('/:id', asyncHandler(removeController));
