/**
 * Helpers de validación Zod reutilizados por los módulos.
 */
import { z } from 'zod';

// Acepta "2026-06-19" o ISO; cadena vacía => null; convierte a Date.
export const dateInput = z
  .union([z.coerce.date(), z.literal('').transform(() => null)])
  .optional()
  .nullable();

// Como dateInput pero OBLIGATORIO: el rango de un lote no puede faltar
// (spec §3, Decisión 3). Usar dateInput aquí sería un fallo silencioso.
export const requiredDateInput = z.coerce.date({
  required_error: 'La fecha es obligatoria',
  invalid_type_error: 'La fecha no es válida',
});

// Granularidad de período: semana ISO o mes. Default mes (la unidad contable).
export const granularity = z.enum(['week', 'month']).default('month');

// Clave de período: 'YYYY-Www' (W01–W53) o 'YYYY-MM' (01–12). La validez real de
// la semana (W53 solo existe algunos años) la comprueba periodRange, no la regex.
export const periodKeyInput = z
  .string()
  .regex(
    /^\d{4}-(W(0[1-9]|[1-4]\d|5[0-3])|(0[1-9]|1[0-2]))$/,
    'Formato de período inválido (YYYY-MM o YYYY-Www)',
  );

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
