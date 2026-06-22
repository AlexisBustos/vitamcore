import { z } from 'zod';
import { priorityEnum } from '../projects/projects.schema';

export const taskStatusEnum = z.enum(['TODO', 'DOING', 'DONE']);

export const taskSourceEnum = z.enum([
  'MANUAL',
  'MEETING',
  'EMAIL',
  'DOCUMENT',
  'AI',
  'OTHER',
]);

const dateInput = z
  .union([z.coerce.date(), z.literal('').transform(() => null)])
  .optional()
  .nullable();

const optionalText = z.string().trim().max(5000).optional().nullable();

export const createTaskSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(2, 'El título es obligatorio'),
  description: optionalText,
  status: taskStatusEnum.default('TODO'),
  priority: priorityEnum.default('MEDIUM'),
  dueDate: dateInput,
  owner: z.string().trim().max(200).optional().nullable(),
  source: taskSourceEnum.default('MANUAL'),
  notes: optionalText,
});

export const updateTaskSchema = createTaskSchema
  .omit({ organizationId: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listTasksQuery = z.object({
  organizationId: z.string().optional(),
  businessUnitId: z.string().optional(),
  projectId: z.string().optional(),
  status: taskStatusEnum.optional(),
  priority: priorityEnum.optional(),
  // 'true' => solo tareas vencidas y no cerradas.
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksFilters = z.infer<typeof listTasksQuery>;
