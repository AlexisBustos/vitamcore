/**
 * Lógica de negocio de etiquetas (Label). Por empresa.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertOrganization } from '../shared/relations';
import type { CreateLabelInput, ListLabelsFilters, UpdateLabelInput } from './labels.schema';

export function list(filters: ListLabelsFilters) {
  return prisma.label.findMany({
    where: { organizationId: filters.organizationId },
    orderBy: { name: 'asc' },
  });
}

export async function create(input: CreateLabelInput) {
  await assertOrganization(input.organizationId);
  try {
    return await prisma.label.create({ data: input });
  } catch (err) {
    throw handleUnique(err);
  }
}

export async function update(id: string, input: UpdateLabelInput) {
  const exists = await prisma.label.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Etiqueta no encontrada');
  try {
    return await prisma.label.update({ where: { id }, data: input });
  } catch (err) {
    throw handleUnique(err);
  }
}

export async function remove(id: string) {
  const exists = await prisma.label.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Etiqueta no encontrada');
  await prisma.label.delete({ where: { id } }); // TaskLabel se borra por cascade
}

function handleUnique(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return badRequest('Ya existe una etiqueta con ese nombre en la empresa');
  }
  return err;
}
