import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  EntityStatusBadge,
  ProjectStatusBadge,
  PriorityBadge,
} from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { organizationTypeLabels } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganization } from '@/hooks/useOrganizations';
import {
  useDeleteBusinessUnit,
  useSaveBusinessUnit,
} from '@/hooks/useBusinessUnits';
import type { BusinessUnit } from '@/types/domain';
import { OrganizationForm } from './OrganizationForm';
import { BusinessUnitForm } from './BusinessUnitForm';

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: org, isLoading, isError, error } = useOrganization(id);
  const toggleUnit = useSaveBusinessUnit();
  const deleteUnit = useDeleteBusinessUnit();

  const [editOrg, setEditOrg] = useState(false);
  const [unitForm, setUnitForm] = useState<{
    open: boolean;
    unit: BusinessUnit | null;
  }>({ open: false, unit: null });

  if (isLoading) return <Spinner />;
  if (isError || !org)
    return <ErrorState message={getErrorMessage(error)} />;

  async function handleToggle(unit: BusinessUnit) {
    await toggleUnit.mutateAsync({
      id: unit.id,
      data: { status: unit.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
    });
  }

  async function handleDeleteUnit(unit: BusinessUnit) {
    if (!confirm(`¿Eliminar la unidad "${unit.name}"?`)) return;
    await deleteUnit.mutateAsync(unit.id);
  }

  return (
    <div className="space-y-6">
      <Link
        to="/empresas"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Empresas
      </Link>

      <PageHeader
        title={org.name}
        description={organizationTypeLabels[org.type]}
        actions={
          <Button variant="outline" onClick={() => setEditOrg(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Estado
            </p>
            <EntityStatusBadge value={org.status} />
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Unidades
            </p>
            <p className="font-semibold">{org._count?.businessUnits ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Proyectos
            </p>
            <p className="font-semibold">{org._count?.projects ?? 0}</p>
          </div>
          {org.description && (
            <p className="w-full text-sm text-[var(--color-muted-foreground)]">
              {org.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Unidades de negocio */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Unidades de negocio</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUnitForm({ open: true, unit: null })}
          >
            <Plus className="h-4 w-4" /> Nueva unidad
          </Button>
        </CardHeader>
        <CardContent>
          {org.businessUnits.length === 0 ? (
            <EmptyState title="Sin unidades">
              Agrega la primera unidad de esta empresa.
            </EmptyState>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {org.businessUnits.map((unit) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-[var(--color-foreground)]">
                      {unit.name}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {unit._count?.projects ?? 0} proyectos
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <EntityStatusBadge value={unit.status} />
                    <Button
                      size="sm"
                      variant="ghost"
                      title={unit.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                      onClick={() => handleToggle(unit)}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Editar"
                      onClick={() => setUnitForm({ open: true, unit })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Eliminar"
                      onClick={() => handleDeleteUnit(unit)}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proyectos de la empresa */}
      <Card>
        <CardHeader>
          <CardTitle>Proyectos</CardTitle>
        </CardHeader>
        <CardContent>
          {org.projects.length === 0 ? (
            <EmptyState title="Sin proyectos">
              Esta empresa todavía no tiene proyectos.
            </EmptyState>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {org.projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/proyectos/${project.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-80"
                >
                  <div>
                    <p className="font-medium text-[var(--color-foreground)]">
                      {project.name}
                    </p>
                    {project.businessUnit && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {project.businessUnit.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge value={project.priority} />
                    <ProjectStatusBadge value={project.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editOrg && (
        <OrganizationForm
          open={editOrg}
          onClose={() => setEditOrg(false)}
          organization={org}
        />
      )}
      {unitForm.open && (
        <BusinessUnitForm
          open={unitForm.open}
          onClose={() => setUnitForm({ open: false, unit: null })}
          organizationId={org.id}
          unit={unitForm.unit}
        />
      )}
    </div>
  );
}
