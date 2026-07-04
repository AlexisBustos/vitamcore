/**
 * Lógica de negocio de autenticación.
 * No conoce a Express: recibe datos validados y devuelve datos/errores.
 */
import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../utils/password';
import { signSessionToken } from '../../utils/jwt';
import { badRequest, unauthorized } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import type { ChangePasswordInput, LoginInput } from './auth.schema';

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  // Mensaje genérico para no revelar si el email existe.
  const invalid = unauthorized('Credenciales inválidas');

  if (!user || !user.isActive) throw invalid;

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw invalid;

  const token = signSessionToken({ sub: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw unauthorized('Sesión inválida');

  // Modo voluntario: exige y verifica la contraseña actual.
  // Modo forzado (mustChangePassword): no la pide (ya se autenticó al entrar).
  if (!user.mustChangePassword) {
    if (!input.currentPassword) throw unauthorized('Contraseña actual incorrecta');
    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) throw unauthorized('Contraseña actual incorrecta');
  }

  // La nueva debe ser distinta de la actual.
  const same = await verifyPassword(input.newPassword, user.passwordHash);
  if (same) throw badRequest('La nueva contraseña debe ser distinta de la actual');

  const passwordHash = await hashPassword(input.newPassword);
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      mustChangePassword: true,
    },
  });
}
