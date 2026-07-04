import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useChangePassword } from '@/hooks/useChangePassword';
import { landingPath } from '@/lib/permissions';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Pantalla de primer ingreso forzado: pide solo la nueva contraseña.
 * El usuario ya se autenticó con la clave temporal en el login.
 */
export function ChangePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const change = useChangePassword();
  const [nueva, setNueva] = useState('');
  const [confirma, setConfirma] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Solo tiene sentido con el flag activo. Si ya no lo tiene, fuera de aquí.
  if (user && !user.mustChangePassword) {
    return <Navigate to={landingPath(user.role)} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (nueva !== confirma) return setError('Las contraseñas no coinciden.');
    try {
      await change.mutateAsync({ newPassword: nueva });
      navigate(landingPath(user?.role), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.',
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--color-foreground)]">
            Definí tu contraseña
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Por seguridad, elegí una contraseña nueva para continuar.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="nueva">Nueva contraseña</Label>
            <Input
              id="nueva"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="confirma">Repetí la contraseña</Label>
            <Input
              id="confirma"
              type="password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={change.isPending}>
            {change.isPending ? 'Guardando…' : 'Guardar y continuar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
