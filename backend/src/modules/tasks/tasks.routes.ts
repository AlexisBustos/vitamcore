import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './tasks.controller';
import {
  addItemController,
  updateItemController,
  removeItemController,
} from './checklist.controller';

export const tasksRouter = Router();

tasksRouter.get('/', asyncHandler(listController));
tasksRouter.post('/', asyncHandler(createController));
tasksRouter.get('/:id', asyncHandler(getController));
tasksRouter.patch('/:id', asyncHandler(updateController));
tasksRouter.delete('/:id', asyncHandler(removeController));

// Checklist anidada (hereda el acceso ALL_ROLES del montaje de /tasks).
tasksRouter.post('/:id/checklist', asyncHandler(addItemController));
tasksRouter.patch('/:id/checklist/:itemId', asyncHandler(updateItemController));
tasksRouter.delete('/:id/checklist/:itemId', asyncHandler(removeItemController));
