/**
 * Firma y verificación de JWT de sesión.
 */
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface SessionPayload {
  sub: string; // id del usuario
  role: string;
}

export function signSessionToken(payload: SessionPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
}

/** Nombre de la cookie que transporta el JWT. */
export const SESSION_COOKIE = 'vitam_session';
