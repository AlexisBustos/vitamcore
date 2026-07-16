/**
 * Configuración de la aplicación Express.
 * Separada del arranque (index.ts) para facilitar pruebas futuras.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { apiRouter } from './routes';
import { globalRateLimit } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  // Detrás de Nginx (reverse proxy + terminación SSL). Necesario para que
  // Express respete X-Forwarded-Proto y las cookies `secure` funcionen, y
  // para que el rate limit identifique la IP real del cliente.
  app.set('trust proxy', 1);

  // Cabeceras de seguridad HTTP. La API no sirve HTML propio, así que la CSP
  // por defecto de helmet no interfiere; se deja el resto de protecciones.
  app.use(helmet());

  // Logging estructurado de cada request (método, ruta, status, latencia).
  // No registra el health check para no ensuciar los logs con sondas.
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true, // necesario para enviar/recibir la cookie de sesión
    }),
  );

  // Tope general de solicitudes por IP (antes de parsear el cuerpo).
  app.use('/api', globalRateLimit);

  app.use(express.json());
  app.use(cookieParser());

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
