/**
 * Lista de personas asignables como responsable. Solo lectura, sin passwordHash.
 * Endpoint accesible a todos los roles (a diferencia del módulo admin /users).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const assignableSelect = {
  id: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

export function listAssignables() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: assignableSelect,
    orderBy: { name: 'asc' },
  });
}
