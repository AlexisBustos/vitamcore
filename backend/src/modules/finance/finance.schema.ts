import { z } from 'zod';
import { granularity, periodKeyInput } from '../shared/zod';

export const summaryQuery = z.object({
  organizationId: z.string().optional(),
  granularity,
  period: periodKeyInput.optional(),
});

export const consolidatedQuery = z.object({
  organizationId: z.string().optional(),
  granularity,
  period: periodKeyInput.optional(),
});

export const autoReconcileSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  granularity,
  period: periodKeyInput.optional(),
  apply: z.boolean().default(false),
  // Selección de pares a aplicar (invoiceId:movId). Solo se usa con apply=true;
  // si se omite, se aplican todos los pares detectados.
  selection: z
    .array(z.object({ invoiceId: z.string().min(1), movId: z.string().min(1) }))
    .optional(),
});

// Reconoce transferencias a/desde terceros como gastos o ingresos pagados,
// atribuidos al destinatario/pagador. direction 'expense' = "Traspaso A: <nombre>"
// (pagos → gastos); 'income' = "Traspaso De: <nombre>" (cobros → ingresos).
// selection = ids de movimientos a crear (solo con apply).
export const recognizeTransfersSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  granularity,
  period: periodKeyInput.optional(),
  direction: z.enum(['expense', 'income']).default('expense'),
  category: z.string().trim().min(1).default('Honorarios'),
  apply: z.boolean().default(false),
  selection: z.array(z.string().min(1)).optional(),
});

export type SummaryFilters = z.infer<typeof summaryQuery>;
export type ConsolidatedFilters = z.infer<typeof consolidatedQuery>;
export type AutoReconcileInput = z.infer<typeof autoReconcileSchema>;
export type RecognizeTransfersInput = z.infer<typeof recognizeTransfersSchema>;
