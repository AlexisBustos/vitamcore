/**
 * Middleware de autorización por rol. Asume que requireAuth ya corrió
 * (existe req.user). Define el bloqueo real de secciones.
 */
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../utils/http-error';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Permite solo si req.user.role está en `roles`; si no, 403. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized('Sesión no encontrada'));
    if (!roles.includes(req.user.role)) {
      return next(forbidden('No tienes permiso para esta sección'));
    }
    next();
  };
}

/**
 * Autorización sensible al método: GET/HEAD usan `read`; el resto usa `write`.
 * Sirve para datos de referencia (empresas, unidades) que el colaborador
 * necesita leer para poblar selectores pero no puede modificar.
 */
export function allowRoles(opts: { read: readonly string[]; write: readonly string[] }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized('Sesión no encontrada'));
    const allowed = READ_METHODS.has(req.method) ? opts.read : opts.write;
    if (!allowed.includes(req.user.role)) {
      return next(forbidden('No tienes permiso para esta acción'));
    }
    next();
  };
}
