import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--color-muted-foreground)]">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-danger)]">
      {message ?? 'Ocurrió un error al cargar los datos.'}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-4 py-12 text-center">
      <p className="text-sm font-medium text-[var(--color-foreground)]">
        {title}
      </p>
      {children && (
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {children}
        </p>
      )}
    </div>
  );
}
