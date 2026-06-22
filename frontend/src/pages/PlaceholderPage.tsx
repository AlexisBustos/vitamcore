import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/** Pantalla base profesional para secciones aún no implementadas. */
export function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {description}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-muted)]">
            <Construction className="h-6 w-6 text-[var(--color-muted-foreground)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            Módulo en construcción
          </p>
          <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
            Esta sección se implementará en próximos sprints. La estructura
            y la navegación ya están preparadas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
