/**
 * Punto de entrada del backend de VITAM CORE.
 */
import { env } from './config/env';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅ VITAM CORE API escuchando en http://localhost:${env.PORT}`);
  console.log(`   Entorno: ${env.NODE_ENV}`);
});

// Cierre ordenado.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\nRecibido ${signal}, cerrando servidor...`);
    server.close(() => process.exit(0));
  });
}
