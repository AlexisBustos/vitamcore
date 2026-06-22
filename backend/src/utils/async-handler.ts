/**
 * Envuelve un controlador async para que cualquier error
 * se propague al middleware central de errores.
 */
import type { NextFunction, Request, Response } from 'express';

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
