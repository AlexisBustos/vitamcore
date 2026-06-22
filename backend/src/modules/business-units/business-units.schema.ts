import { z } from 'zod';
import { entityStatusEnum } from '../organizations/organizations.schema';

export const createBusinessUnitSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  name: z.string().trim().min(2, 'El nombre es obligatorio'),
  description: z.string().trim().max(2000).optional().nullable(),
  type: z.string().trim().max(120).optional().nullable(),
  status: entityStatusEnum.default('ACTIVE'),
});

// La empresa de una unidad no se cambia en update (evita inconsistencias).
export const updateBusinessUnitSchema = createBusinessUnitSchema
  .omit({ organizationId: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listBusinessUnitsQuery = z.object({
  organizationId: z.string().optional(),
  status: entityStatusEnum.optional(),
});

export type CreateBusinessUnitInput = z.infer<
  typeof createBusinessUnitSchema
>;
export type UpdateBusinessUnitInput = z.infer<
  typeof updateBusinessUnitSchema
>;
