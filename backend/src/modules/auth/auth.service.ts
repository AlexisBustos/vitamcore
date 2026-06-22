/**
 * Lógica de negocio de autenticación.
 * No conoce a Express: recibe datos validados y devuelve datos/errores.
 */
import { prisma } from '../../lib/prisma';
import { verifyPassword } from '../../utils/password';
import { signSessionToken } from '../../utils/jwt';
import { unauthorized } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import type { LoginInput } from './auth.schema';

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
    },
  };
}
