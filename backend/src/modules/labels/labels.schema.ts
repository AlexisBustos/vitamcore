import { z } from 'zod';

// Paleta fija de colores de etiqueta (clave); el frontend la mapea a clases.
export const labelColorEnum = z.enum([
  'red', 'orange', 'yellow', 'green', 'teal',
  'blue', 'purple', 'pink', 'gray', 'brown',
]);

export const createLabelSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(40),
  color: labelColorEnum,
});

export const updateLabelSchema = createLabelSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listLabelsQuery = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type ListLabelsFilters = z.infer<typeof listLabelsQuery>;
