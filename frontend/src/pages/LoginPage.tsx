import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logoSymbol from '@/assets/logo-vitam-symbol.png';

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Control ejecutivo en un solo lugar',
    description: 'Proyectos, tareas y finanzas de Vitam Healthcare y Vitam Tech.',
  },
  {
    icon: Users,
    title: 'Cada equipo con su vista',
    description: 'Accesos por rol: dirección, administración y colaboradores.',
  },
  {
    icon: ShieldCheck,
    title: 'Acceso seguro',
    description: 'Sesión cifrada que se cierra al salir del navegador.',
  },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión, no mostramos el login.
  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo iniciar sesión. Intenta de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca (oculto en móvil) */}
      <aside className="relative hidden overflow-hidden bg-[var(--color-sidebar)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Acentos decorativos sutiles */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--color-accent)] opacity-20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[var(--color-primary)] opacity-30 blur-3xl"
        />

        <div className="relative flex items-center gap-3.5">
          <img src={logoSymbol} alt="Vitam" className="h-10 w-auto" />
          <div>
            <p className="text-base font-semibold tracking-wide text-white">
              VITAM CORE
            </p>
            <p className="text-xs text-[var(--color-sidebar-foreground)]">
              Dirección Ejecutiva
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-2xl font-semibold leading-snug text-white">
            La plataforma interna de Vitam para dirigir, organizar y decidir.
          </h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-white/10 text-white">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-sm text-[var(--color-sidebar-foreground)]">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[var(--color-sidebar-foreground)]">
          © {new Date().getFullYear()} Vitam · Uso interno autorizado
        </p>
      </aside>

      {/* Panel del formulario */}
      <main className="flex items-center justify-center bg-[var(--color-background)] px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Marca compacta solo en móvil */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] bg-[var(--color-sidebar)] p-2">
              <img src={logoSymbol} alt="Vitam" className="w-full" />
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--color-foreground)]">
                VITAM CORE
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Dirección Ejecutiva
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
              Inicia sesión
            </h1>
            <p className="mt-1.5 text-sm text-[var(--color-muted-foreground)]">
              Ingresa con tu cuenta de Vitam para continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <div className="relative">
                <Mail
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@vitam.tech"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="px-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-[var(--radius)] border border-[var(--color-danger)]/20 bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-[var(--color-muted-foreground)]">
            ¿Problemas para entrar? Escribe a{' '}
            <a
              href="mailto:a.bustos@vitam.tech"
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              soporte interno
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
