/**
 * Límites de tasa (rate limiting) para proteger la API.
 * - `globalRateLimit`: tope general por IP sobre toda la API.
 * - `loginRateLimit`: tope estricto sobre el login (superficie de fuerza bruta).
 *
 * Se desactiva bajo NODE_ENV=test para no interferir con la suite de pruebas.
 */
import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

/** Tope general: generoso para una herramienta interna de un solo usuario. */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isTest || req.path === '/health',
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
});

/** Tope estricto para el login: frena ataques de fuerza bruta a credenciales. */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    error: 'Demasiados intentos de acceso. Espera unos minutos e inténtalo otra vez.',
  },
});
