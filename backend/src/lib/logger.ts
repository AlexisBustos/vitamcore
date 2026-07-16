/**
 * Logger estructurado (pino) singleton.
 * En producción emite JSON (ideal para agregadores/PM2 logs).
 * En desarrollo usa pino-pretty para una salida legible en consola.
 */
import pino from 'pino';
import { env, isProduction } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // No registrar datos sensibles si algún día se loguean headers/bodies.
  redact: ['req.headers.cookie', 'req.headers.authorization'],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});
