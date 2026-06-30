import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createCategoryController,
  deleteCategoryController,
  listCategoriesController,
  reapplyController,
  updateCategoryController,
} from './categories.controller';

export const financeCategoriesRouter = Router();

financeCategoriesRouter.get('/', asyncHandler(listCategoriesController));
financeCategoriesRouter.post('/', asyncHandler(createCategoryController));
financeCategoriesRouter.post('/reapply', asyncHandler(reapplyController));
financeCategoriesRouter.patch('/:key', asyncHandler(updateCategoryController));
financeCategoriesRouter.delete('/:key', asyncHandler(deleteCategoryController));
