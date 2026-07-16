import { z } from 'zod';
import {
  amount,
  currency,
  dateInput,
  granularity,
  optionalShortText,
  optionalText,
  periodKeyInput,
  recurrenceFrequencyEnum,
} from '../shared/zod';

export const expenseStatusEnum = z.enum([
  'PENDING',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]);

export const createExpenseSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  vendorName: optionalShortText,
  description: z.string().trim().min(2, 'La descripción es obligatoria'),
  amount,
  currency,
  category: optionalShortText,
  status: expenseStatusEnum.default('PENDING'),
  expenseDate: dateInput,
  dueDate: dateInput,
  isRecurring: z.coerce.boolean().default(false),
  recurrenceFrequency: recurrenceFrequencyEnum.optional().nullable(),
  notes: optionalText,
});

export const updateExpenseSchema = createExpenseSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listExpenseQuery = z.object({
  organizationId: z.string().optional(),
  businessUnitId: z.string().optional(),
  projectId: z.string().optional(),
  category: z.string().optional(),
  status: expenseStatusEnum.optional(),
  isRecurring: z.enum(['true', 'false']).optional(),
  paymentState: z.enum(['payable', 'overdue', 'paid', 'cancelled']).optional(),
  // Búsqueda libre por nombre de proveedor, folio o RUT del documento.
  search: z.string().trim().min(1).optional(),
  granularity,
  period: periodKeyInput.optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpenseFilters = z.infer<typeof listExpenseQuery>;

export const registerPaymentSchema = z.object({
  paidDate: dateInput.nullable(),
  bankTransactionId: z.string().optional().nullable(),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

// Pago/conciliación en lote: N gastos contra un movimiento, o marcado/reversión
// masiva con fecha. Misma semántica que registerPaymentSchema pero con varios ids.
export const bulkRegisterPaymentSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Debes seleccionar al menos un gasto'),
  paidDate: dateInput,
  bankTransactionId: z.string().optional().nullable(),
});
export type BulkRegisterPaymentInput = z.infer<typeof bulkRegisterPaymentSchema>;
