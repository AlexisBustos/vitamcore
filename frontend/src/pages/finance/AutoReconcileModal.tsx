import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { useAutoReconcile } from '@/hooks/useFinance';
import type { AutoReconcileResult } from '@/types/domain';

export function AutoReconcileModal({
  open,
  onClose,
  organizationId,
  month,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  month?: string;
}) {
  const auto = useAutoReconcile();
  const [preview, setPreview] = useState<AutoReconcileResult | null>(null);
  const [done, setDone] = useState<AutoReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Al abrir, corre el preview (apply:false). Limpia el estado al cerrar.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setDone(null);
      setError(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    auto
      .mutateAsync({ organizationId, month, apply: false })
      .then((r) => {
        if (!cancel) setPreview(r);
      })
      .catch((e) => {
        if (!cancel) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, month]);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const r = await auto.mutateAsync({ organizationId, month, apply: true });
      setDone(r);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Auto-conciliar movimientos exactos"
      description="Enlaza solo los pares de monto único dentro de ±60 días; lo ambiguo queda para el modal manual."
    >
      <div className="space-y-4">
        {loading && <Spinner label="Calculando…" />}
        {error && <ErrorState message={error} />}

        {!loading && !error && done && (
          <p className="text-sm text-[var(--color-foreground)]">
            Se enlazaron <strong>{done.pairs}</strong> par(es):{' '}
            {done.linkedIncome} ingreso(s) y {done.linkedExpense} gasto(s).
          </p>
        )}

        {!loading && !error && !done && preview && (
          <p className="text-sm text-[var(--color-foreground)]">
            Se enlazarán <strong>{preview.pairs}</strong> par(es) exacto(s) (
            {preview.linkedIncome} ingreso(s), {preview.linkedExpense} gasto(s)).{' '}
            {preview.ambiguousAmounts > 0
              ? `${preview.ambiguousAmounts} monto(s) quedan ambiguos para revisar a mano.`
              : 'No hay montos ambiguos.'}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
          <Button variant="outline" onClick={onClose}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button
              onClick={confirm}
              disabled={loading || !preview || preview.pairs === 0}
            >
              Confirmar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
