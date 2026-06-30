import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { useReconciliationCandidates } from '@/hooks/useFinance';

export type ReconcileRecord = {
  id: string;
  name: string;
  folio: string | null;
  amount: number;
};

export function ReconcileModal({
  open,
  onClose,
  recordType,
  record,
  pending,
  onReconcile,
  onPayManual,
}: {
  open: boolean;
  onClose: () => void;
  recordType: 'income' | 'expense';
  record: ReconcileRecord | null;
  pending: boolean;
  onReconcile: (bankTransactionId: string) => void;
  onPayManual: () => void;
}) {
  const [search, setSearch] = useState('');
  const candidates = useReconciliationCandidates(
    { recordType, recordId: record?.id ?? '', search: search || undefined },
    open && !!record,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Conciliar con un movimiento"
      description={
        record
          ? `${record.name} · ${record.folio ?? 's/folio'} · ${formatMoney(record.amount)}`
          : undefined
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
                </div>
                <Button onClick={() => onReconcile(c.id)} disabled={pending}>
                  Conciliar
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end border-t border-[var(--color-border)] pt-3">
          <Button variant="outline" onClick={onPayManual} disabled={pending}>
            Marcar pagada sin movimiento
          </Button>
        </div>
      </div>
    </Modal>
  );
}
