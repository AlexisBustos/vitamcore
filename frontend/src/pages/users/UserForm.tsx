import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from '@/context/AuthContext';
import { useSaveUser, type AdminUser } from '@/hooks/useUsers';

interface Props {
  open: boolean;
  onClose: () => void;
  user?: AdminUser | null;
}

const roleOptions = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'COLABORADOR', label: 'Colaborador' },
];

export function UserForm({ open, onClose, user }: Props) {
  const editing = !!user;
  const { user: currentUser } = useAuth();
  const save = useSaveUser();
  const [error, setError] = useState<string | null>(null);

  // Guardrails de UI: el backend vuelve a validar esto, pero deshabilitamos
  // los controles para que quede claro por qué no se puede tocar.
  const isSelf = !!user && user.id === currentUser?.id;
  const isCeo = !!user && user.role === 'CEO';
  const lockRoleAndStatus = isSelf || isCeo;

  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user && user.role !== 'CEO' ? user.role : '',
    isActive: user?.isActive ?? true,
    password: '',
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        const data: Record<string, unknown> = { name: form.name };
        if (!lockRoleAndStatus) {
          data.role = form.role;
          data.isActive = form.isActive;
        }
        if (form.password) data.password = form.password;
        await save.mutateAsync({ id: user.id, data });
      } else {
        await save.mutateAsync({
          data: {
            name: form.name,
            email: form.email,
            role: form.role,
            password: form.password,
          },
        });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const roleSelectOptions = isCeo
    ? [{ value: 'CEO', label: 'CEO' }, ...roleOptions]
    : roleOptions;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar usuario' : 'Nuevo usuario'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre" required>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </Field>

        {!editing && (
          <Field label="Correo" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Rol" required={!editing}>
          <Select
            options={roleSelectOptions}
            placeholder={editing ? undefined : 'Selecciona rol'}
            value={isCeo ? 'CEO' : form.role}
            onChange={(e) => set('role', e.target.value)}
            disabled={lockRoleAndStatus}
            required={!editing}
          />
          {lockRoleAndStatus && (
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {isCeo
                ? 'El rol de CEO no es asignable.'
                : 'No puedes cambiar tu propio rol.'}
            </p>
          )}
        </Field>

        {editing && (
          <Field label="Estado">
            <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                disabled={lockRoleAndStatus}
                className="h-4 w-4 rounded border-[var(--color-border)] disabled:opacity-50"
              />
              Activo
            </label>
            {lockRoleAndStatus && (
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {isCeo
                  ? 'El usuario CEO no puede desactivarse.'
                  : 'No puedes desactivar tu propia cuenta.'}
              </p>
            )}
          </Field>
        )}

        <Field label="Contraseña" required={!editing}>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder={editing ? 'Dejar en blanco para no cambiar' : undefined}
            required={!editing}
          />
        </Field>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
