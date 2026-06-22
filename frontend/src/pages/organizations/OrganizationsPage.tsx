import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EntityStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { organizationTypeLabels } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { OrganizationForm } from './OrganizationForm';

export function OrganizationsPage() {
  const { data, isLoading, isError, error } = useOrganizations();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        description="Gestión de Vitam Healthcare, Vitam Tech y entidades transversales."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva empresa
          </Button>
        }
      />

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && data.length === 0 && (
        <EmptyState title="Aún no hay empresas">
          Crea la primera empresa para empezar.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((org) => (
            <Link key={org.id} to={`/empresas/${org.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-[var(--color-accent)]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-muted)]">
                      <Building2 className="h-5 w-5 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--color-foreground)]">
                        {org.name}
                      </h3>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {organizationTypeLabels[org.type]}
                      </p>
                    </div>
                  </div>
                  <EntityStatusBadge value={org.status} />
                </div>

                {org.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                    {org.description}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Badge className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                    {org._count?.businessUnits ?? 0} unidades
                  </Badge>
                  <Badge className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                    {org._count?.projects ?? 0} proyectos
                  </Badge>
                  <Badge className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                    {org._count?.tasks ?? 0} tareas
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {formOpen && (
        <OrganizationForm open={formOpen} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
