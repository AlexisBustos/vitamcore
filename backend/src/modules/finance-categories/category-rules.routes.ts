import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createRuleController,
  deleteRuleController,
  listRulesController,
  previewRuleController,
  reorderRulesController,
  updateRuleController,
} from './category-rules.controller';

export const financeCategoryRulesRouter = Router();

financeCategoryRulesRouter.get('/', asyncHandler(listRulesController));
financeCategoryRulesRouter.post('/', asyncHandler(createRuleController));
financeCategoryRulesRouter.get('/preview', asyncHandler(previewRuleController));
financeCategoryRulesRouter.post('/reorder', asyncHandler(reorderRulesController));
financeCategoryRulesRouter.patch('/:id', asyncHandler(updateRuleController));
financeCategoryRulesRouter.delete('/:id', asyncHandler(deleteRuleController));
