/**
 * Lógica de negocio de proyectos (Project).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import {
  assertBusinessUnitInOrganization,
  assertOrganization,
} from '../shared/relations';
import type {
  CreateProjectInput,
  ListProjectsFilters,
  UpdateProjectInput,
} from './projects.schema';

export async function list(filters: ListProjectsFilters) {
  return prisma.project.findMany({
    where: {
      organizationId: filters.organizationId,
      businessUnitId: filters.businessUnitId,
      status: filters.status,
      priority: filters.priority,
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
  });
}

export async function getById(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      businessUnit: { select: { id: true, name: true } },
      tasks: { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
    },
  });
  if (!project) throw notFound('Proyecto no encontrado');
  return project;
}

export async function create(input: CreateProjectInput) {
  await assertOrganization(input.organizationId);
  if (input.businessUnitId) {
    await assertBusinessUnitInOrganization(
      input.businessUnitId,
      input.organizationId,
    );
  }
  try {
    return await prisma.project.create({ data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function update(id: string, input: UpdateProjectInput) {
  const current = await prisma.project.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!current) throw notFound('Proyecto no encontrado');

  // Si se cambia la unidad, debe pertenecer a la empresa del proyecto.
  if (input.businessUnitId) {
    await assertBusinessUnitInOrganization(
      input.businessUnitId,
      current.organizationId,
    );
  }

  try {
    return await prisma.project.update({ where: { id }, data: input });
  } catch (err) {
    throw handleUniqueError(err);
  }
}

export async function remove(id: string) {
  const exists = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound('Proyecto no encontrado');
  // Las tareas asociadas quedan con projectId = null (SetNull).
  await prisma.project.delete({ where: { id } });
}

function handleUniqueError(err: unknown) {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return badRequest(
      'Ya existe un proyecto con ese nombre en la empresa',
    );
  }
  return err;
}
