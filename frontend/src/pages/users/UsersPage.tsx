import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { useUsers, type AdminUser } from '@/hooks/useUsers';
import { UserForm } from './UserForm';

const roleLabels: Record<AdminUser['role'], string> = {
  CEO: 'CEO',
  ADMIN: 'Admin',
  COLABORADOR: 'Colaborador',
};

const roleClassName: Record<AdminUser['role'], string> = {
  CEO: 'bg-violet-50 text-violet-700',
  ADMIN: 'bg-blue-50 text-blue-700',
  COLABORADOR: 'bg-slate-100 text-slate-600',
};

export function UsersPage() {
  const { data, isLoading, isError, error } = useUsers();
  const [form, setForm] = useState<{ open: boolean; user: AdminUser | null }>({
    open: false,
    user: null,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Gestión de accesos al sistema"
        actions={
          <Button onClick={() => setForm({ open: true, user: null })}>
            <Plus className="h-4 w-4" /> Nuevo usuario
          </Button>
        }
      />

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && data.length === 0 && (
        <EmptyState title="Sin usuarios">
          Aún no hay usuarios. Crea el primero con “Nuevo usuario”.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Correo</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--color-muted)]/40">
                    <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
                      {u.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={roleClassName[u.role]}>
                        {roleLabels[u.role]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }
                      >
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Editar"
                          onClick={() => setForm({ open: true, user: u })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {form.open && (
        <UserForm
          open={form.open}
          onClose={() => setForm({ open: false, user: null })}
          user={form.user}
        />
      )}
    </div>
  );
}
