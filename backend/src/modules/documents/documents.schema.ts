import { z } from 'zod';
import { dateInput, optionalShortText, optionalText } from '../shared/zod';

export const documentTypeEnum = z.enum([
  'CONTRACT',
  'PROPOSAL',
  'QUOTE',
  'REPORT',
  'MEETING_MINUTES',
  'FINANCIAL',
  'TECHNICAL',
  'LEGAL',
  'NORMATIVE',
  'OTHER',
]);

export const documentStatusEnum = z.enum([
  'ACTIVE',
  'ARCHIVED',
  'DRAFT',
  'REVIEW',
  'FINAL',
]);

export const createDocumentSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  businessUnitId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(2, 'El título es obligatorio'),
  description: optionalText,
  fileName: optionalShortText,
  fileUrl: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .nullable(),
  fileType: optionalShortText,
  fileSize: z.coerce.number().int().min(0).optional().nullable(),
  documentType: documentTypeEnum.default('OTHER'),
  status: documentStatusEnum.default('ACTIVE'),
  clientName: optionalShortText,
  tags: z.array(z.string().trim().min(1)).default([]),
  aiSummary: optionalText,
  uploadedAt: dateInput,
});

export const updateDocumentSchema = createDocumentSchema
  .omit({ organizationId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const listDocumentsQuery = z.object({
  organizationId: z.string().optional(),
  businessUnitId: z.string().optional(),
  projectId: z.string().optional(),
  documentType: documentTypeEnum.optional(),
  status: documentStatusEnum.optional(),
  clientName: z.string().optional(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsFilters = z.infer<typeof listDocumentsQuery>;
