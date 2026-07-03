import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { createController, listController, removeController, updateController } from './labels.controller';

export const labelsRouter = Router();
labelsRouter.get('/', asyncHandler(listController));
labelsRouter.post('/', asyncHandler(createController));
labelsRouter.patch('/:id', asyncHandler(updateController));
labelsRouter.delete('/:id', asyncHandler(removeController));
