/**
 * Helpers de validación Zod reutilizados por los módulos.
 */
import { z } from 'zod';

// Acepta "2026-06-19" o ISO; cadena vacía => null; convierte a Date.
export const dateInput = z
  .union([z.coerce.date(), z.literal('').transform(() => null)])
  .optional()
  .nullable();

export const optionalText = z.string().trim().max(5000).optional().nullable();

export const optionalShortText = z
  .string()
  .trim()
  .max(255)
  .optional()
  .nullable();

// Monto entero no negativo (CLP por defecto, sin decimales).
export const amount = z.coerce
  .number()
  .int('El monto debe ser un número entero')
  .min(0, 'El monto no puede ser negativo')
  .default(0);

export const currency = z.string().trim().min(1).max(8).default('CLP');

export const recurrenceFrequencyEnum = z.enum([
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);
