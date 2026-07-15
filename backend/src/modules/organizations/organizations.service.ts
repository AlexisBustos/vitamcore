/**
 * Lógica de negocio de empresas (Organization).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import { isRestrictedUser, projectVisibilityWhere } from '../shared/visibility';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from './organizations.schema';

export async function list() {
  return prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { businessUnits: true, projects: true, tasks: true } },
    },
  });
}

export async function getById(id: string, user?: AuthUser) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      businessUnits: {
        orderBy: { name: 'asc' },
        include: { _count: { select: { projects: true } } },
      },
      projects: {
        // Visibilidad row-level: un colaborador no debe enumerar ocultos aquí.
        where: isRestrictedUser(user)
          ? { AND: [projectVisibilityWhere(user.id)] }
          : undefined,
        orderBy: { updatedAt: 'desc' },
        include: { businessUnit: { select: { id: true, name: true } } },
      },
      // Los _count agregados NO se filtran por visibilidad: revelan solo
      // cantidades (no nombres) y Prisma no admite `where` en _count.select.
      // Aceptado para esta herramienta interna (ver spec de visibilidad).
      _count: { select: { businessUnits: true, projects: true, tasks: true } },
    },
  });
  if (!org) throw notFound('Empresa no encontrada');
  return org;
}

export async function create(input: CreateOrganizationInput) {
  try {
    return await prisma.organization.create({ data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function update(id: string, input: UpdateOrganizationInput) {
  await ensureExists(id);
  try {
    return await prisma.organization.update({ where: { id }, data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function remove(id: string) {
  await ensureExists(id);
  // Cascade borra unidades, proyectos y tareas asociadas.
  await prisma.organization.delete({ where: { id } });
}

async function ensureExists(id: string) {
  const exists = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Empresa no encontrada');
}

function handleUniqueError(err: unknown) {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return badRequest('Ya existe una empresa con ese nombre');
  }
  return err;
}
