/**
 * Lógica de negocio de documentos (Document).
 * Por ahora gestiona metadatos; el archivo físico vivirá en S3/R2 a futuro.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import { assertContext } from '../shared/relations';
import type {
  CreateDocumentInput,
  ListDocumentsFilters,
  UpdateDocumentInput,
} from './documents.schema';

const refs = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

export async function list(filters: ListDocumentsFilters) {
  const where: Prisma.DocumentWhereInput = {
    organizationId: filters.organizationId,
    businessUnitId: filters.businessUnitId,
    projectId: filters.projectId,
    documentType: filters.documentType,
    status: filters.status,
  };
  if (filters.clientName) {
    where.clientName = { contains: filters.clientName, mode: 'insensitive' };
  }

  return prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: refs,
  });
}

export async function getById(id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: refs });
  if (!doc) throw notFound('Documento no encontrado');
  return doc;
}

export async function create(input: CreateDocumentInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.document.create({ data: input });
}

export async function update(id: string, input: UpdateDocumentInput) {
  const current = await prisma.document.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Documento no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.document.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  const exists = await prisma.document.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Documento no encontrado');
  await prisma.document.delete({ where: { id } });
}
