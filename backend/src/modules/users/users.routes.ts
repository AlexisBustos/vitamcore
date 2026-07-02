import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  listUsersController,
  createUserController,
  updateUserController,
} from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', asyncHandler(listUsersController));
usersRouter.post('/', asyncHandler(createUserController));
usersRouter.patch('/:id', asyncHandler(updateUserController));
