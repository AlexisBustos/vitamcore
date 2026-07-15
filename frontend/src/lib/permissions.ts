/**
 * Gating de UI por rol (fuente única para menú y rutas).
 * El backend es la autoridad real; esto solo evita mostrar lo que no aplica.
 */
export function isAdmin(role?: string): boolean {
  return role === 'CEO' || role === 'ADMIN';
}

// Rutas accesibles por el colaborador (todo lo demás es solo-admin).
export const COLLABORATOR_PATHS = ['/proyectos', '/tareas'];

/** ¿El rol puede acceder a esta ruta privada? */
export function canAccessPath(path: string, role?: string): boolean {
  if (isAdmin(role)) return true;
  return COLLABORATOR_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

/** Ruta de aterrizaje según rol (admin → dashboard; colaborador → sus tareas). */
export function landingPath(role?: string): string {
  return isAdmin(role) ? '/' : '/tareas';
}
