import { z } from 'zod';

export const directionSchema = z.enum(['CHARGE', 'CREDIT', 'ANY']);

export const createRuleSchema = z.object({
  categoryKey: z.string().min(1),
  matchText: z.string().min(1, 'El texto de la regla es obligatorio'),
  direction: directionSchema.optional(),
});

export const updateRuleSchema = z.object({
  categoryKey: z.string().min(1).optional(),
  matchText: z.string().min(1).optional(),
  direction: directionSchema.optional(),
  active: z.boolean().optional(),
});

export const reorderRulesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const previewRuleQuery = z.object({
  matchText: z.string().min(1),
  direction: directionSchema.optional(),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
