import { z } from 'zod';

export const kindSchema = z.enum(['INCOME', 'EXPENSE', 'NEUTRAL']);

export const listCategoriesQuery = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  kind: kindSchema,
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  kind: kindSchema.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
