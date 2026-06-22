import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './tasks.controller';

export const tasksRouter = Router();

tasksRouter.get('/', asyncHandler(listController));
tasksRouter.post('/', asyncHandler(createController));
tasksRouter.get('/:id', asyncHandler(getController));
tasksRouter.patch('/:id', asyncHandler(updateController));
tasksRouter.delete('/:id', asyncHandler(removeController));
