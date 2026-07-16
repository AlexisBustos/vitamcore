/**
 * Punto de entrada del backend de VITAM CORE.
 */
import { env } from './config/env';
import { logger } from './lib/logger';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `VITAM CORE API escuchando en http://localhost:${env.PORT}`,
  );
});

// Cierre ordenado.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`Recibido ${signal}, cerrando servidor...`);
    server.close(() => process.exit(0));
  });
}
