/**
 * Error HTTP tipado para usar en servicios y controladores.
 * El middleware de errores lo traduce a una respuesta limpia.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthorized = (msg = 'No autorizado') =>
  new HttpError(401, msg);
export const badRequest = (msg = 'Solicitud inválida') =>
  new HttpError(400, msg);
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg);
export const forbidden = (msg = 'Acceso denegado') => new HttpError(403, msg);
