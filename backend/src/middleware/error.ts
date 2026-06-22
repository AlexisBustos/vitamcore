/**
 * Middleware central de manejo de errores.
 * Nunca expone stack traces ni detalles internos al cliente.
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error';
import { isProduction } from '../config/env';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      details: err.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Error no controlado: se registra en servidor, se oculta al cliente.
  if (!isProduction) {
    console.error('Error no controlado:', err);
  }
  return res.status(500).json({ error: 'Error interno del servidor' });
}
