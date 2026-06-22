import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './documents.controller';

export const documentsRouter = Router();

documentsRouter.get('/', asyncHandler(listController));
documentsRouter.post('/', asyncHandler(createController));
documentsRouter.get('/:id', asyncHandler(getController));
documentsRouter.patch('/:id', asyncHandler(updateController));
documentsRouter.delete('/:id', asyncHandler(removeController));
