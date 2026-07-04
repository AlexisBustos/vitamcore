import { useState } from 'react';
import { KeyRound, LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const initials = (user?.name ?? '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 md:px-6">
      <button
        onClick={onToggleSidebar}
        className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            {user?.name}
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {user?.role}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
          {initials || 'V'}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPwd(true)}
          title="Cambiar contraseña"
        >
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">Contraseña</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </div>

      <ChangePasswordModal open={showPwd} onClose={() => setShowPwd(false)} />
    </header>
  );
}
