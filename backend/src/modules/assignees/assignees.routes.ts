import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { listAssigneesController } from './assignees.controller';

export const assigneesRouter = Router();

assigneesRouter.get('/', asyncHandler(listAssigneesController));
