import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './projects.controller';

export const projectsRouter = Router();

projectsRouter.get('/', asyncHandler(listController));
projectsRouter.post('/', asyncHandler(createController));
projectsRouter.get('/:id', asyncHandler(getController));
projectsRouter.patch('/:id', asyncHandler(updateController));
projectsRouter.delete('/:id', asyncHandler(removeController));
