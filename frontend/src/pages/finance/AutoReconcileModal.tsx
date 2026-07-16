import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/domain';
import { useAutoReconcile, type Granularity } from '@/hooks/useFinance';
import type { AutoReconcilePair, AutoReconcileResult } from '@/types/domain';

/** Clave estable de un par (factura/gasto ↔ movimiento). */
const pairKey = (p: AutoReconcilePair) => `${p.invoiceId}:${p.movId}`;

/** Tabla con el detalle de cada par a enlazar, con casilla para incluir/excluir. */
function PairsTable({
  details,
  selected,
  onToggle,
  onToggleAll,
}: {
  details: AutoReconcilePair[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allChecked = details.every((p) => selected.has(pairKey(p)));
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--color-border)]">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
          <tr>
            <th className="px-2 py-1.5">
              <input
                type="checkbox"
                aria-label="Seleccionar todos"
                checked={allChecked}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </th>
            <th className="px-2 py-1.5 font-medium">Tipo</th>
            <th className="px-2 py-1.5 font-medium">Contraparte / Documento</th>
            <th className="px-2 py-1.5 text-right font-medium">Monto</th>
            <th className="px-2 py-1.5 font-medium">Movimiento bancario</th>
          </tr>
        </thead>
        <tbody>
          {details.map((p) => {
            const key = pairKey(p);
            const checked = selected.has(key);
            return (
              <tr
                key={key}
                className={`border-t border-[var(--color-border)] align-top ${
                  checked ? '' : 'opacity-50'
                }`}
              >
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    aria-label="Incluir par"
                    checked={checked}
                    onChange={() => onToggle(key)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={
                      p.kind === 'income'
                        ? 'rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700'
                        : 'rounded bg-rose-100 px-1.5 py-0.5 text-rose-700'
                    }
                  >
                    {p.kind === 'income' ? 'Ingreso' : 'Gasto'}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-medium text-[var(--color-foreground)]">
                    {p.counterpart}
                  </div>
                  <div className="text-[var(--color-muted-foreground)]">
                    {p.document} · {formatDate(p.invoiceDate)}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {formatMoney(p.amount)}
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-[var(--color-foreground)]">
                    {p.movementDescription}
                    {p.movementDocumentNumber ? ` · ${p.movementDocumentNumber}` : ''}
                  </div>
                  <div className="text-[var(--color-muted-foreground)]">
                    {formatDate(p.movementDate)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AutoReconcileModal({
  open,
  onClose,
  organizationId,
  granularity,
  period,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  granularity: Granularity;
  period?: string;
}) {
  const auto = useAutoReconcile();
  const [preview, setPreview] = useState<AutoReconcileResult | null>(null);
  const [done, setDone] = useState<AutoReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Pares incluidos (por defecto todos); las claves excluidas no se aplican.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Al abrir, corre el preview (apply:false). Limpia el estado al cerrar.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setDone(null);
      setError(null);
      setSelected(new Set());
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    auto
      .mutateAsync({ organizationId, granularity, period, apply: false })
      .then((r) => {
        if (!cancel) {
          setPreview(r);
          setSelected(new Set(r.details.map(pairKey)));
        }
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
  }, [open, organizationId, granularity, period]);

  const selection = useMemo(
    () =>
      (preview?.details ?? [])
        .filter((p) => selected.has(pairKey(p)))
        .map((p) => ({ invoiceId: p.invoiceId, movId: p.movId })),
    [preview, selected],
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(
      checked ? new Set((preview?.details ?? []).map(pairKey)) : new Set(),
    );
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const r = await auto.mutateAsync({
        organizationId,
        granularity,
        period,
        apply: true,
        selection,
      });
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
      size="lg"
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
          <>
            <p className="text-sm text-[var(--color-foreground)]">
              Se detectaron <strong>{preview.pairs}</strong> par(es) exacto(s) (
              {preview.linkedIncome} ingreso(s), {preview.linkedExpense} gasto(s)).{' '}
              {preview.ambiguousAmounts > 0
                ? `${preview.ambiguousAmounts} monto(s) quedan ambiguos para revisar a mano.`
                : 'No hay montos ambiguos.'}
            </p>
            {preview.details.length > 0 && (
              <>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Revisa y desmarca los pares que no quieras enlazar. Al confirmar, la
                  factura/gasto quedará marcada como pagada y enlazada a su movimiento.
                </p>
                <PairsTable
                  details={preview.details}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                />
              </>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
          {!loading && !error && !done && preview && preview.details.length > 0 && (
            <span className="mr-auto text-xs text-[var(--color-muted-foreground)]">
              {selection.length} de {preview.details.length} seleccionado(s)
            </span>
          )}
          <Button variant="outline" onClick={onClose}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button
              onClick={confirm}
              disabled={loading || !preview || selection.length === 0}
            >
              Confirmar {selection.length > 0 ? `(${selection.length})` : ''}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
