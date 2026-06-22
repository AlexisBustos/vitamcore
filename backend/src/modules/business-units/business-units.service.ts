/**
 * Lógica de negocio de unidades de negocio (BusinessUnit).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertOrganization } from '../shared/relations';
import type {
  CreateBusinessUnitInput,
  UpdateBusinessUnitInput,
} from './business-units.schema';

interface ListFilters {
  organizationId?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export async function list(filters: ListFilters) {
  return prisma.businessUnit.findMany({
    where: {
      organizationId: filters.organizationId,
      status: filters.status,
    },
    orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
    include: {
      organization: { select: { id: true, name: true } },
      _count: { select: { projects: true, tasks: true } },
    },
  });
}

export async function getById(id: string) {
  const unit = await prisma.businessUnit.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      projects: { orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!unit) throw notFound('Unidad de negocio no encontrada');
  return unit;
}

export async function create(input: CreateBusinessUnitInput) {
  await assertOrganization(input.organizationId);
  try {
    return await prisma.businessUnit.create({ data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function update(id: string, input: UpdateBusinessUnitInput) {
  await ensureExists(id);
  try {
    return await prisma.businessUnit.update({ where: { id }, data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function remove(id: string) {
  await ensureExists(id);
  await prisma.businessUnit.delete({ where: { id } });
}

async function ensureExists(id: string) {
  const exists = await prisma.businessUnit.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Unidad de negocio no encontrada');
}

function handleUniqueError(err: unknown) {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return badRequest(
      'Ya existe una unidad con ese nombre en la empresa',
    );
  }
  return err;
}
