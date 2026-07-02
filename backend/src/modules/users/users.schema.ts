import { z } from 'zod';

// Email normalizado (trim + minúsculas) para evitar duplicados por mayúsculas.
const email = z.string().trim().toLowerCase().email('Correo inválido');
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres');
// El rol CEO no es asignable desde la API (es único, del dueño).
const assignableRole = z.enum(['ADMIN', 'COLABORADOR']);

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  email,
  role: assignableRole,
  password,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: assignableRole.optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
