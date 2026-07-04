import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/** Layout privado: sidebar + header + área de contenido. */
export function AppLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Primer ingreso forzado: bloquea la app hasta cambiar la contraseña.
  // /cambiar-clave vive fuera de este layout, así que no hay bucle.
  if (user?.mustChangePassword) {
    return <Navigate to="/cambiar-clave" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
      />

      {/* Overlay para móvil cuando el sidebar está abierto. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
