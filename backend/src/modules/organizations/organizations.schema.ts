import { z } from 'zod';

export const organizationTypeEnum = z.enum([
  'HEALTHCARE',
  'TECHNOLOGY',
  'TRANSVERSAL',
]);

export const entityStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio'),
  description: z.string().trim().max(2000).optional().nullable(),
  type: organizationTypeEnum,
  status: entityStatusEnum.default('ACTIVE'),
});

export const updateOrganizationSchema = createOrganizationSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>;
export type UpdateOrganizationInput = z.infer<
  typeof updateOrganizationSchema
>;
