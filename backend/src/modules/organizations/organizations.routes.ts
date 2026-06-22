import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './organizations.controller';

export const organizationsRouter = Router();

organizationsRouter.get('/', asyncHandler(listController));
organizationsRouter.post('/', asyncHandler(createController));
organizationsRouter.get('/:id', asyncHandler(getController));
organizationsRouter.patch('/:id', asyncHandler(updateController));
organizationsRouter.delete('/:id', asyncHandler(removeController));
