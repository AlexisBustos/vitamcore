import { z } from 'zod';

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = z.string().regex(monthRegex, 'Formato de mes inválido (YYYY-MM)');

export const consolidatedQuery = z.object({
  organizationId: z.string().optional(),
  month: month.optional(),
});

export const autoReconcileSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  month: month.optional(),
  apply: z.boolean().default(false),
});

export type ConsolidatedFilters = z.infer<typeof consolidatedQuery>;
export type AutoReconcileInput = z.infer<typeof autoReconcileSchema>;
