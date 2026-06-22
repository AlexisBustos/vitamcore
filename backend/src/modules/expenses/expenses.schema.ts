import { z } from 'zod';
import {
  amount,
  currency,
  dateInput,
  optionalShortText,
  optionalText,
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
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpenseFilters = z.infer<typeof listExpenseQuery>;
