/**
 * Controlador de autenticación: traduce HTTP <-> servicio.
 * Setea/limpia la cookie httpOnly que transporta el JWT.
 */
import type { CookieOptions, Request, Response } from 'express';
import { isProduction } from '../../config/env';
import { SESSION_COOKIE } from '../../utils/jwt';
import { changePasswordSchema, loginSchema } from './auth.schema';
import * as authService from './auth.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction, // solo HTTPS en producción
  sameSite: 'lax',
  path: '/',
  maxAge: SEVEN_DAYS_MS,
};

export async function loginController(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { token, user } = await authService.login(input);

  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json({ user });
}

export async function logoutController(_req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
}

export async function meController(req: Request, res: Response) {
  // requireAuth garantiza que req.user existe.
  res.json({ user: req.user });
}

export async function changePasswordController(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  const user = await authService.changePassword(req.user!.id, input);
  res.json({ user });
}
