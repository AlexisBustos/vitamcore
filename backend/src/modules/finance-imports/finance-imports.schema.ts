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

export const listTransactionsQuery = z.object({
  organizationId: z.string().optional(),
  bankAccountId: z.string().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato de mes inválido (YYYY-MM)')
    .optional(),
  search: z.string().trim().max(255).optional(),
  category: z.string().optional(),
  reconciliation: z.enum(['linked', 'unlinked']).optional(),
});

export const listByCategoryQuery = listTransactionsQuery.pick({
  organizationId: true,
  bankAccountId: true,
  month: true,
});

export const setCategorySchema = z.object({
  category: z.string().nullable(),
});

export const bulkCategorySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  category: z.string().nullable(),
});

export type BulkCategoryInput = z.infer<typeof bulkCategorySchema>;

// Candidatos: por una factura concreta (recordId) o por un monto objetivo
// (organizationId + amount) cuando se concilian varias facturas contra un solo
// movimiento (la suma de lo seleccionado).
export const reconciliationCandidatesQuery = z
  .object({
    recordType: z.enum(['income', 'expense']),
    recordId: z.string().min(1).optional(),
    organizationId: z.string().min(1).optional(),
    amount: z.coerce.number().int().nonnegative().optional(),
    search: z.string().trim().optional(),
  })
  .refine((d) => !!d.recordId || (!!d.organizationId && d.amount !== undefined), {
    message: 'Se requiere recordId, o bien organizationId + amount',
  });
export type ReconciliationCandidatesFilters = z.infer<typeof reconciliationCandidatesQuery>;

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type PreviewImportInput = z.infer<typeof previewImportSchema>;
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
export type ListAccountsFilters = z.infer<typeof listAccountsQuery>;
export type ListBatchesFilters = z.infer<typeof listBatchesQuery>;
export type ListTransactionsFilters = z.infer<typeof listTransactionsQuery>;
export type ListByCategoryFilters = z.infer<typeof listByCategoryQuery>;
export type SetCategoryInput = z.infer<typeof setCategorySchema>;
