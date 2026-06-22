import { ApiError } from '@/lib/api';

/** Extrae un mensaje legible desde un error de API o genérico. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado.';
}
