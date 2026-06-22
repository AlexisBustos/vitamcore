import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './decisions.controller';

export const decisionsRouter = Router();

decisionsRouter.get('/', asyncHandler(listController));
decisionsRouter.post('/', asyncHandler(createController));
decisionsRouter.get('/:id', asyncHandler(getController));
decisionsRouter.patch('/:id', asyncHandler(updateController));
decisionsRouter.delete('/:id', asyncHandler(removeController));
