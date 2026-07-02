/**
 * Lógica de negocio de usuarios. Único punto que escribe la tabla User.
 * Nunca devuelve passwordHash (select explícito). Errores vía http-error.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../utils/password';
import { badRequest, notFound } from '../../utils/http-error';
import type { CreateUserInput, UpdateUserInput } from './users.schema';

// Campos públicos: jamás incluye passwordHash.
const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function listUsers() {
  return prisma.user.findMany({ select: publicSelect, orderBy: { createdAt: 'asc' } });
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash },
      select: publicSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw badRequest('Ya existe un usuario con ese correo');
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput, currentUserId: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('Usuario no encontrado');

  // Proteger al CEO: no se puede desactivar ni cambiar su rol.
  if (target.role === 'CEO') {
    if (input.isActive === false) throw badRequest('No se puede desactivar al usuario CEO');
    if (input.role && input.role !== 'CEO') throw badRequest('No se puede cambiar el rol del usuario CEO');
  }

  // Anti-auto-bloqueo: no puedes desactivarte ni degradarte a ti mismo.
  if (id === currentUserId) {
    if (input.isActive === false) throw badRequest('No puedes desactivar tu propia cuenta');
    if (input.role === 'COLABORADOR') throw badRequest('No puedes quitarte tu propio acceso de administrador');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);

  return prisma.user.update({ where: { id }, data, select: publicSelect });
}
