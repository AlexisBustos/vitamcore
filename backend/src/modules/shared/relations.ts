/**
 * Validaciones de coherencia entre entidades.
 * Garantizan que las relaciones empresa → unidad → proyecto → tarea
 * sean consistentes antes de escribir en la base de datos.
 */
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';

/** Verifica que la empresa exista; devuelve su id. */
export async function assertOrganization(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) throw notFound('La empresa indicada no existe');
}

/**
 * Verifica que la unidad exista y pertenezca a la empresa indicada.
 * Evita asociar una unidad a una empresa incorrecta.
 */
export async function assertBusinessUnitInOrganization(
  businessUnitId: string,
  organizationId: string,
) {
  const unit = await prisma.businessUnit.findUnique({
    where: { id: businessUnitId },
    select: { id: true, organizationId: true },
  });
  if (!unit) throw notFound('La unidad de negocio indicada no existe');
  if (unit.organizationId !== organizationId) {
    throw badRequest(
      'La unidad de negocio no pertenece a la empresa indicada',
    );
  }
}

/**
 * Verifica que el proyecto exista y pertenezca a la empresa indicada.
 * Evita que una tarea quede asociada a un proyecto de otra empresa.
 */
export async function assertProjectInOrganization(
  projectId: string,
  organizationId: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });
  if (!project) throw notFound('El proyecto indicado no existe');
  if (project.organizationId !== organizationId) {
    throw badRequest('El proyecto no pertenece a la empresa indicada');
  }
}

/**
 * Valida el contexto completo de un registro: que la empresa exista y que
 * la unidad y el proyecto (si vienen) pertenezcan a esa empresa.
 * Reutilizable por todos los módulos ejecutivos.
 */
export async function assertContext(
  organizationId: string,
  businessUnitId?: string | null,
  projectId?: string | null,
) {
  await assertOrganization(organizationId);
  if (businessUnitId) {
    await assertBusinessUnitInOrganization(businessUnitId, organizationId);
  }
  if (projectId) {
    await assertProjectInOrganization(projectId, organizationId);
  }
}

/**
 * Verifica que el usuario responsable exista (si viene ownerId).
 * Solo comprueba existencia, NO isActive: la restricción de "solo activos"
 * vive en el endpoint /assignees (lo que puebla el desplegable). Así, si un
 * responsable se desactiva luego, editar el registro no queda bloqueado.
 */
export async function assertAssignableUser(ownerId?: string | null) {
  if (!ownerId) return;
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true },
  });
  if (!user) throw badRequest('El responsable indicado no existe');
}
