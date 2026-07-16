import { z } from 'zod';

/** Formato de la previsualización del informe semanal. */
export const previewQuerySchema = z.object({
  format: z.enum(['json', 'html', 'text']).default('json'),
});

export type PreviewQuery = z.infer<typeof previewQuerySchema>;
