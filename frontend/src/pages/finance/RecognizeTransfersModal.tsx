import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner, ErrorState } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/domain';
import { useRecognizeTransfers, type Granularity } from '@/hooks/useFinance';
import type { RecognizeTransfer, RecognizeTransfersResult } from '@/types/domain';

type Direction = 'expense' | 'income';

// Textos y defaults por dirección (gasto = pagos a terceros; ingreso = cobros).
const COPY: Record<
  Direction,
  {
    title: string;
    description: string;
    defaultCategory: string;
    counterpartHeader: string;
    detected: (n: number, total: string) => string;
    doneVerb: (n: number, total: string) => string;
    createLabel: string;
  }
> = {
  expense: {
    title: 'Reconocer transferencias como gastos',
    description:
      "Crea un gasto pagado por cada 'Traspaso a: <nombre>' sin gasto asociado, atribuido al destinatario y conciliado con su movimiento.",
    defaultCategory: 'Honorarios',
    counterpartHeader: 'Destinatario',
    detected: (n, total) =>
      `Se detectaron ${n} transferencia(s) a terceros sin gasto asociado por ${total}.`,
    doneVerb: (n, total) =>
      `Se crearon ${n} gasto(s) por ${total}, ya conciliados con su movimiento.`,
    createLabel: 'Crear',
  },
  income: {
    title: 'Reconocer cobros como ingresos',
    description:
      "Crea un ingreso cobrado por cada 'Traspaso de: <nombre>' sin ingreso asociado, atribuido al pagador y conciliado con su movimiento.",
    defaultCategory: 'Ventas',
    counterpartHeader: 'Pagador',
    detected: (n, total) =>
      `Se detectaron ${n} cobro(s) de terceros sin ingreso asociado por ${total}.`,
    doneVerb: (n, total) =>
      `Se crearon ${n} ingreso(s) por ${total}, ya conciliados con su movimiento.`,
    createLabel: 'Crear',
  },
};

/** Tabla de transferencias a terceros detectadas, con casilla para incluir/excluir. */
function TransfersTable({
  details,
  selected,
  counterpartHeader,
  onToggle,
  onToggleAll,
}: {
  details: RecognizeTransfer[];
  selected: Set<string>;
  counterpartHeader: string;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allChecked = details.every((d) => selected.has(d.movId));
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
            <th className="px-2 py-1.5 font-medium">{counterpartHeader}</th>
            <th className="px-2 py-1.5 text-right font-medium">Monto</th>
            <th className="px-2 py-1.5 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d) => {
            const checked = selected.has(d.movId);
            return (
              <tr
                key={d.movId}
                className={`border-t border-[var(--color-border)] ${
                  checked ? '' : 'opacity-50'
                }`}
              >
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    aria-label="Incluir"
                    checked={checked}
                    onChange={() => onToggle(d.movId)}
                  />
                </td>
                <td className="px-2 py-1.5 font-medium text-[var(--color-foreground)]">
                  {d.payee}
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {formatMoney(d.amount)}
                </td>
                <td className="px-2 py-1.5 text-[var(--color-muted-foreground)]">
                  {formatDate(d.date)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RecognizeTransfersModal({
  open,
  onClose,
  organizationId,
  granularity,
  period,
  direction,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  granularity: Granularity;
  period?: string;
  direction: Direction;
}) {
  const copy = COPY[direction];
  const recognize = useRecognizeTransfers();
  const [preview, setPreview] = useState<RecognizeTransfersResult | null>(null);
  const [done, setDone] = useState<RecognizeTransfersResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState(copy.defaultCategory);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Al abrir, corre el preview (apply:false). Limpia el estado al cerrar.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setDone(null);
      setError(null);
      setSelected(new Set());
      setCategory(copy.defaultCategory);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    recognize
      .mutateAsync({
        organizationId,
        granularity,
        period,
        direction,
        category: copy.defaultCategory,
        apply: false,
      })
      .then((r) => {
        if (!cancel) {
          setPreview(r);
          setSelected(new Set(r.details.map((d) => d.movId)));
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
  }, [open, organizationId, granularity, period, direction]);

  const selection = useMemo(
    () =>
      (preview?.details ?? [])
        .filter((d) => selected.has(d.movId))
        .map((d) => d.movId),
    [preview, selected],
  );

  const selectedTotal = useMemo(
    () =>
      (preview?.details ?? [])
        .filter((d) => selected.has(d.movId))
        .reduce((s, d) => s + d.amount, 0),
    [preview, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(
      checked ? new Set((preview?.details ?? []).map((d) => d.movId)) : new Set(),
    );
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const r = await recognize.mutateAsync({
        organizationId,
        granularity,
        period,
        direction,
        category: category.trim() || copy.defaultCategory,
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
      title={copy.title}
      description={copy.description}
    >
      <div className="space-y-4">
        {loading && <Spinner label="Calculando…" />}
        {error && <ErrorState message={error} />}

        {!loading && !error && done && (
          <p className="text-sm text-[var(--color-foreground)]">
            {copy.doneVerb(done.created, formatMoney(done.totalAmount))}
          </p>
        )}

        {!loading && !error && !done && preview && (
          <>
            <p className="text-sm text-[var(--color-foreground)]">
              {copy.detected(preview.count, formatMoney(preview.totalAmount))}
            </p>
            {preview.details.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--color-muted-foreground)]">
                    Categoría:
                  </label>
                  <div className="w-48">
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder={copy.defaultCategory}
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {direction === 'income'
                    ? 'Cada uno se creará como ingreso cobrado con el pagador como cliente. Desmarca los que no quieras registrar; puedes editar categoría o cliente después en Ingresos.'
                    : 'Cada uno se creará como gasto pagado con el destinatario como proveedor. Desmarca los que no quieras registrar; puedes editar categoría o proveedor después en Gastos.'}
                </p>
                <TransfersTable
                  details={preview.details}
                  selected={selected}
                  counterpartHeader={copy.counterpartHeader}
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
              {selection.length} de {preview.details.length} · {formatMoney(selectedTotal)}
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
              {copy.createLabel} {selection.length > 0 ? `(${selection.length})` : ''}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
