import { z } from 'zod';

export const projectStatusEnum = z.enum([
  'IDEA',
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'COMPLETED',
  'PAUSED',
  'CANCELLED',
]);

export const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// Acepta "2026-06-19" o ISO; convierte a Date. Cadena vacía => null.
const dateInput = z
  .union([z.coerce.date(), z.literal('').transform(() => null)])
  .optional()
  .nullable();

const optionalText = z.string().trim().max(5000).optional().nullable();

export const createProjectSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(2, 'El nombre es obligatorio'),
  description: optionalText,
  status: projectStatusEnum.default('IDEA'),
  priority: priorityEnum.default('MEDIUM'),
  startDate: dateInput,
  targetDate: dateInput,
  ownerId: z.string().min(1).optional().nullable(),
  // Lista de visibilidad; vacía u omitida = proyecto público.
  // Solo la procesan CEO/ADMIN (el service la ignora para colaboradores).
  memberIds: z.array(z.string().min(1)).optional(),
  nextAction: optionalText,
  risks: optionalText,
  notes: optionalText,
});

// organizationId no se cambia en update para preservar la coherencia.
export const updateProjectSchema = createProjectSchema
  .omit({ organizationId: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listProjectsQuery = z.object({
  organizationId: z.string().optional(),
  ownerId: z.string().optional(),
  businessUnitId: z.string().optional(),
  status: projectStatusEnum.optional(),
  priority: priorityEnum.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsFilters = z.infer<typeof listProjectsQuery>;
