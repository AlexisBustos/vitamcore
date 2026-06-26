import { z } from 'zod';
import {
  amount,
  currency,
  dateInput,
  optionalShortText,
  optionalText,
  recurrenceFrequencyEnum,
} from '../shared/zod';

export const incomeStatusEnum = z.enum([
  'EXPECTED',
  'INVOICED',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]);

export const createIncomeSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  clientName: optionalShortText,
  description: z.string().trim().min(2, 'La descripción es obligatoria'),
  amount,
  currency,
  category: optionalShortText,
  status: incomeStatusEnum.default('EXPECTED'),
  incomeDate: dateInput,
  dueDate: dateInput,
  isRecurring: z.coerce.boolean().default(false),
  recurrenceFrequency: recurrenceFrequencyEnum.optional().nullable(),
  notes: optionalText,
});

export const updateIncomeSchema = createIncomeSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listIncomeQuery = z.object({
  organizationId: z.string().optional(),
  businessUnitId: z.string().optional(),
  projectId: z.string().optional(),
  category: z.string().optional(),
  status: incomeStatusEnum.optional(),
  isRecurring: z.enum(['true', 'false']).optional(),
  documentKind: z.enum(['SALE', 'CREDIT_NOTE', 'DEBIT_NOTE']).optional(),
  paymentState: z.enum(['receivable', 'overdue', 'paid', 'cancelled']).optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)')
    .optional(),
});

export const registerPaymentSchema = z.object({
  paidDate: dateInput.nullable(),
});

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type ListIncomeFilters = z.infer<typeof listIncomeQuery>;
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;
