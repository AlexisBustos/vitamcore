import { z } from 'zod';
import {
  amount,
  currency,
  dateInput,
  optionalShortText,
  optionalText,
} from '../shared/zod';

export const salesStatusEnum = z.enum([
  'LEAD',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'DIAGNOSIS_DONE',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'PAUSED',
]);

export const salesSourceEnum = z.enum([
  'MANUAL',
  'REFERRAL',
  'EMAIL',
  'MEETING',
  'WEBSITE',
  'LINKEDIN',
  'EXISTING_CLIENT',
  'OTHER',
]);

export const createSalesSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  clientName: z.string().trim().min(1, 'El cliente es obligatorio'),
  contactName: optionalShortText,
  contactEmail: z
    .union([z.string().email(), z.literal('')])
    .optional()
    .nullable(),
  contactPhone: optionalShortText,
  opportunityName: z.string().trim().min(2, 'El nombre es obligatorio'),
  productOrService: optionalShortText,
  estimatedAmount: amount,
  currency,
  probability: z.coerce.number().int().min(0).max(100).default(0),
  status: salesStatusEnum.default('LEAD'),
  expectedCloseDate: dateInput,
  nextAction: optionalText,
  nextFollowUpDate: dateInput,
  source: salesSourceEnum.default('MANUAL'),
  notes: optionalText,
});

export const updateSalesSchema = createSalesSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listSalesQuery = z.object({
  organizationId: z.string().optional(),
  businessUnitId: z.string().optional(),
  projectId: z.string().optional(),
  status: salesStatusEnum.optional(),
  productOrService: z.string().optional(),
  minProbability: z.coerce.number().int().min(0).max(100).optional(),
  // 'true' => abiertas sin próxima fecha de seguimiento.
  noFollowUp: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type CreateSalesInput = z.infer<typeof createSalesSchema>;
export type UpdateSalesInput = z.infer<typeof updateSalesSchema>;
export type ListSalesFilters = z.infer<typeof listSalesQuery>;
