import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useChangePassword } from '@/hooks/useChangePassword';
import { ApiError } from '@/lib/api';

/** Cambio voluntario de contraseña (pide la actual). */
export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const change = useChangePassword();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirma, setConfirma] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setActual('');
    setNueva('');
    setConfirma('');
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8)
      return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (nueva !== confirma) return setError('Las contraseñas no coinciden.');
    try {
      await change.mutateAsync({ currentPassword: actual, newPassword: nueva });
      close();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.',
      );
    }
  }

  return (
    <Modal open={open} onClose={close} title="Cambiar contraseña">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="actual">Contraseña actual</Label>
          <Input
            id="actual"
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="nueva">Nueva contraseña</Label>
          <Input
            id="nueva"
            type="password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="confirma">Repetí la nueva</Label>
          <Input
            id="confirma"
            type="password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? 'Guardando…' : 'Cambiar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
