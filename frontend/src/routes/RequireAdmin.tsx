import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { isAdmin, landingPath } from '@/lib/permissions';

/**
 * Envuelve las rutas solo-admin. Un colaborador que intente entrar
 * (por URL directa) es redirigido a su landing (/tareas).
 * Va dentro de ProtectedRoute, así que ya hay sesión validada.
 */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!isAdmin(user?.role)) {
    return <Navigate to={landingPath(user?.role)} replace />;
  }
  return <Outlet />;
}
