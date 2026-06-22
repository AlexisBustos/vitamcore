import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createController,
  getController,
  listController,
  removeController,
  updateController,
} from './business-units.controller';

export const businessUnitsRouter = Router();

businessUnitsRouter.get('/', asyncHandler(listController));
businessUnitsRouter.post('/', asyncHandler(createController));
businessUnitsRouter.get('/:id', asyncHandler(getController));
businessUnitsRouter.patch('/:id', asyncHandler(updateController));
businessUnitsRouter.delete('/:id', asyncHandler(removeController));
