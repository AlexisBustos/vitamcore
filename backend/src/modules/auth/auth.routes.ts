import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/async-handler';
import {
  changePasswordController,
  loginController,
  logoutController,
  meController,
} from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', asyncHandler(loginController));
authRouter.post('/logout', asyncHandler(logoutController));
authRouter.get('/me', requireAuth, asyncHandler(meController));
authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(changePasswordController),
);
