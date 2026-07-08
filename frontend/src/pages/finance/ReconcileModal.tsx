import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { useReconciliationCandidates } from '@/hooks/useFinance';

// Objetivo de conciliación: una factura (recordId → ranking por fecha) o un
// conjunto de facturas contra un movimiento (sin recordId, se buscan candidatos
// por la suma `amount`). `ids` son las facturas a marcar/conciliar.
export type ReconcileTarget = {
  ids: string[];
  recordId?: string;
  organizationId: string;
  amount: number;
  label: string;
};

export function ReconcileModal({
  open,
  onClose,
  recordType,
  target,
  pending,
  onReconcile,
  onPayManual,
}: {
  open: boolean;
  onClose: () => void;
  recordType: 'income' | 'expense';
  target: ReconcileTarget | null;
  pending: boolean;
  onReconcile: (bankTransactionId: string) => void;
  onPayManual: (paidDate: string) => void;
}) {
  const [search, setSearch] = useState('');
  // Fecha de pago para el marcado manual; por defecto hoy (formato YYYY-MM-DD),
  // se reinicia cada vez que se abre el modal.
  const [paidDate, setPaidDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  useEffect(() => {
    if (open) {
      setPaidDate(new Date().toLocaleDateString('en-CA'));
      setSearch('');
    }
  }, [open]);

  const multiple = (target?.ids.length ?? 0) > 1;
  const candidates = useReconciliationCandidates(
    target
      ? target.recordId
        ? { recordType, recordId: target.recordId, search: search || undefined }
        : {
            recordType,
            organizationId: target.organizationId,
            amount: target.amount,
            search: search || undefined,
          }
      : { recordType },
    open && !!target,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Conciliar con un movimiento"
      description={
        target ? `${target.label} · ${formatMoney(target.amount)}` : undefined
      }
    >
      <div className="space-y-4">
        <Input
          placeholder="Buscar movimiento por descripción…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {candidates.isLoading && <Spinner label="Buscando movimientos…" />}
        {candidates.data && candidates.data.length === 0 && (
          <EmptyState title="Sin movimientos candidatos">
            Ajusta la búsqueda o usa “Marcar pagada sin movimiento”.
          </EmptyState>
        )}

        {candidates.data && candidates.data.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
            {candidates.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-[var(--color-foreground)]">
                      {c.description}
                    </span>
                    {c.exact && (
                      <Badge className="bg-emerald-50 text-emerald-700">calza exacto</Badge>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(c.transactionDate)} · {formatMoney(c.amount)}
                  </span>
                  {target && !c.exact && (
                    <span className="mt-0.5 block text-xs text-[var(--color-warning)]">
                      ⚠ movimiento {formatMoney(c.amount)} ≠ {multiple ? 'suma' : 'factura'}{' '}
                      {formatMoney(target.amount)}
                    </span>
                  )}
                </div>
                <Button onClick={() => onReconcile(c.id)} disabled={pending}>
                  Conciliar
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end justify-end gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)]">
              Fecha de pago
            </label>
            <Input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-44"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => onPayManual(paidDate)}
            disabled={pending || !paidDate}
          >
            {multiple ? 'Marcar pagadas sin movimiento' : 'Marcar pagada sin movimiento'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
