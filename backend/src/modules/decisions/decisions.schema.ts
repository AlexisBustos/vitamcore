import { z } from 'zod';
import { dateInput, optionalText } from '../shared/zod';

export const decisionStatusEnum = z.enum([
  'DRAFT',
  'ACTIVE',
  'IMPLEMENTED',
  'REVISIT',
  'CANCELLED',
]);

export const createDecisionSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(2, 'El título es obligatorio'),
  context: optionalText,
  decision: z.string().trim().min(2, 'La decisión es obligatoria'),
  rationale: optionalText,
  risks: optionalText,
  nextStep: optionalText,
  decisionDate: dateInput,
  status: decisionStatusEnum.default('DRAFT'),
  notes: optionalText,
});

export const updateDecisionSchema = createDecisionSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listDecisionsQuery = z.object({
  organizationId: z.string().optional(),
  businessUnitId: z.string().optional(),
  projectId: z.string().optional(),
  status: decisionStatusEnum.optional(),
});

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
export type ListDecisionsFilters = z.infer<typeof listDecisionsQuery>;
