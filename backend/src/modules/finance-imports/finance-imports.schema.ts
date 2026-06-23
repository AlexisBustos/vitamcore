import { z } from 'zod';
import { currency, optionalShortText } from '../shared/zod';

export const importTypeEnum = z.enum([
  'SALES_REPORT',
  'PURCHASE_REPORT',
  'BANK_STATEMENT',
]);

export const createBankAccountSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  name: z.string().trim().min(2, 'El nombre de la cuenta es obligatorio'),
  bankName: optionalShortText,
  accountNumber: z
    .string()
    .trim()
    .min(2, 'El número de cuenta es obligatorio'),
  currency,
});

export const updateBankAccountSchema = createBankAccountSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listAccountsQuery = z.object({
  organizationId: z.string().optional(),
});

export const previewImportSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  bankAccountId: z.string().min(1).optional().nullable(),
  type: importTypeEnum,
  periodMonth: z.coerce.date({
    required_error: 'El período es obligatorio',
    invalid_type_error: 'El período no es válido',
  }),
});

export const confirmImportSchema = z.object({
  batchId: z.string().min(1, 'El lote es obligatorio'),
});

export const listBatchesQuery = z.object({
  organizationId: z.string().optional(),
  bankAccountId: z.string().optional(),
  type: importTypeEnum.optional(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type PreviewImportInput = z.infer<typeof previewImportSchema>;
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
export type ListAccountsFilters = z.infer<typeof listAccountsQuery>;
export type ListBatchesFilters = z.infer<typeof listBatchesQuery>;
