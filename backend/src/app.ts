/**
 * Configuración de la aplicación Express.
 * Separada del arranque (index.ts) para facilitar pruebas futuras.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  // Detrás de Nginx (reverse proxy + terminación SSL). Necesario para que
  // Express respete X-Forwarded-Proto y las cookies `secure` funcionen.
  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true, // necesario para enviar/recibir la cookie de sesión
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
