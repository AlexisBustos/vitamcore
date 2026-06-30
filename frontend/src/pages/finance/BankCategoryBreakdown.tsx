import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import {
  bankCategoryLabel,
  bankCategoryType,
  formatMoney,
  type BankCategory,
} from '@/lib/domain';
import { useBankByCategory } from '@/hooks/useFinance';

type Row = { key: string; label: string; amount: number };

export function BankCategoryBreakdown({
  organizationId,
  bankAccountId,
  month,
}: {
  organizationId?: string;
  bankAccountId?: string;
  month?: string;
}) {
  const query = useBankByCategory({ organizationId, bankAccountId, month });

  const { ingresos, egresos, traspasos, totalIn, totalOut } = useMemo(() => {
    const data = query.data ?? [];
    const ingresos: Row[] = [];
    const egresos: Row[] = [];
    let traspasos = 0;
    for (const r of data) {
      if (r.category === 'TRASPASO_INTERNO') {
        traspasos += r.credits + r.charges;
        continue;
      }
      if (r.category === null) {
        if (r.credits > 0) ingresos.push({ key: 'null-in', label: 'Sin categoría', amount: r.credits });
        if (r.charges > 0) egresos.push({ key: 'null-out', label: 'Sin categoría', amount: r.charges });
        continue;
      }
      const type = bankCategoryType[r.category as BankCategory];
      if (type === 'INCOME') {
        ingresos.push({ key: r.category, label: bankCategoryLabel(r.category), amount: r.credits });
      } else if (type === 'EXPENSE') {
        egresos.push({ key: r.category, label: bankCategoryLabel(r.category), amount: r.charges });
      }
    }
    ingresos.sort((a, b) => b.amount - a.amount);
    egresos.sort((a, b) => b.amount - a.amount);
    const totalIn = ingresos.reduce((s, r) => s + r.amount, 0);
    const totalOut = egresos.reduce((s, r) => s + r.amount, 0);
    return { ingresos, egresos, traspasos, totalIn, totalOut };
  }, [query.data]);

  if (query.isLoading) return <Spinner label="Cargando desglose…" />;
  if (!query.data || query.data.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          De dónde entra / a dónde va
        </h3>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Por categoría, según los filtros activos. Los traspasos entre cuentas no
          cuentan como ingreso ni gasto real.
        </p>
      </div>
      <div className="grid gap-0 sm:grid-cols-2 sm:divide-x divide-[var(--color-border)]">
        <Block title="Ingresos" rows={ingresos} total={totalIn} tone="success" />
        <Block title="Egresos" rows={egresos} total={totalOut} tone="danger" />
      </div>
      {traspasos > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted-foreground)]">
          Traspaso entre cuentas (neutro): {formatMoney(traspasos)}
        </div>
      )}
    </Card>
  );
}

function Block({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: Row[];
  total: number;
  tone: 'success' | 'danger';
}) {
  const color = tone === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]';
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-[var(--color-muted-foreground)]">{title}</span>
        <span className={`text-sm font-semibold ${color}`}>{formatMoney(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">—</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-foreground)]">{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{formatMoney(r.amount)}</span>
                <span className="w-10 text-right text-xs text-[var(--color-muted-foreground)]">
                  {total > 0 ? `${Math.round((r.amount / total) * 100)}%` : '—'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
