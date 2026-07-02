/**
 * Definición única de roles y del predicado "es administrador".
 * Consumido por el middleware de autorización y por el service de usuarios.
 */
export const ADMIN_ROLES = ['CEO', 'ADMIN'] as const;
export const ALL_ROLES = ['CEO', 'ADMIN', 'COLABORADOR'] as const;

/** True si el rol tiene acceso total (CEO o ADMIN). */
export function isAdminRole(role: string): boolean {
  return role === 'CEO' || role === 'ADMIN';
}
