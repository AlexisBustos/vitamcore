/**
 * Middleware de autenticación.
 * Lee el JWT desde la cookie httpOnly, lo verifica y adjunta
 * el usuario autenticado a la request.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { SESSION_COOKIE, verifySessionToken } from '../utils/jwt';
import { unauthorized } from '../utils/http-error';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Extiende el tipo Request de Express con el usuario autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw unauthorized('Sesión no encontrada');

    const payload = verifySessionToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw unauthorized('Sesión inválida');
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (err) {
    // Token expirado/manipulado o usuario inexistente => 401 genérico.
    next(unauthorized('Sesión inválida o expirada'));
  }
}
