/**
 * Cobertura de importación: ¿qué falta por cargar? (spec §5)
 *
 * Para cada fuente (Ventas, Compras, y una fila por cuenta bancaria) y cada
 * período del rango, calcula covered | partial | missing como el solape entre el
 * período y la UNIÓN de los rangos [periodStart, periodEnd] de los lotes
 * CONFIRMED. La cobertura se basa en el rango DECLARADO del lote, no en sus
 * filas: una semana sin ventas con un lote confirmado que la cubre cuenta como
 * cubierta (por eso el rango declarado gana al derivado, Decisión 3).
 */
import type { FinancialImportType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { periodRange, periodSeries, type Granularity } from '../shared/period';

const DIA_MS = 86_400_000;

export type CoverageStatus = 'covered' | 'partial' | 'missing';
export type CoverageCell = { period: string; status: CoverageStatus };
export type CoverageRow = {
  source: { type: FinancialImportType; bankAccountId?: string; label: string };
  cells: CoverageCell[];
};

type BatchRange = { periodStart: Date; periodEnd: Date };

/**
 * Estado de una celda: solape del período [pStart, pLt) con la unión de los
 * rangos declarados (inclusivos → semiabiertos sumando un día a periodEnd).
 */
function cellStatus(pStart: Date, pLt: Date, batches: BatchRange[]): CoverageStatus {
  const ps = pStart.getTime();
  const pl = pLt.getTime();

  // Intervalos de cada lote recortados al período.
  const clipped: Array<[number, number]> = [];
  for (const b of batches) {
    const s = Math.max(b.periodStart.getTime(), ps);
    const e = Math.min(b.periodEnd.getTime() + DIA_MS, pl); // inclusivo → exclusivo
    if (e > s) clipped.push([s, e]);
  }
  if (clipped.length === 0) return 'missing';

  // Longitud de la unión (mezcla de intervalos solapados).
  clipped.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let curStart = clipped[0][0];
  let curEnd = clipped[0][1];
  for (let i = 1; i < clipped.length; i++) {
    const [s, e] = clipped[i];
    if (s > curEnd) {
      covered += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  covered += curEnd - curStart;

  return covered >= pl - ps ? 'covered' : 'partial';
}

function buildRow(
  source: CoverageRow['source'],
  batches: BatchRange[],
  periods: Array<{ key: string; gte: Date; lt: Date }>,
): CoverageRow {
  return {
    source,
    cells: periods.map((p) => ({
      period: p.key,
      status: cellStatus(p.gte, p.lt, batches),
    })),
  };
}

export async function getCoverage(filters: {
  organizationId?: string;
  granularity: Granularity;
  from: string;
  to: string;
}): Promise<{ periods: string[]; rows: CoverageRow[] }> {
  const { organizationId, granularity: g, from, to } = filters;

  const keys = periodSeries(g, from, to);
  const periods = keys.map((key) => ({ key, ...periodRange(g, key) }));

  const [batches, accounts] = await Promise.all([
    prisma.financialImportBatch.findMany({
      where: { organizationId, status: 'CONFIRMED' },
      select: { type: true, bankAccountId: true, periodStart: true, periodEnd: true },
    }),
    prisma.bankAccount.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, bankName: true },
    }),
  ]);

  const byType = (t: FinancialImportType) => batches.filter((b) => b.type === t);

  const rows: CoverageRow[] = [
    buildRow({ type: 'SALES_REPORT', label: 'Ventas' }, byType('SALES_REPORT'), periods),
    buildRow({ type: 'PURCHASE_REPORT', label: 'Compras' }, byType('PURCHASE_REPORT'), periods),
    // La cobertura bancaria es por cuenta, no por empresa: una fila por cuenta.
    ...accounts.map((acc) =>
      buildRow(
        { type: 'BANK_STATEMENT', bankAccountId: acc.id, label: `${acc.bankName} · ${acc.name}` },
        batches.filter((b) => b.type === 'BANK_STATEMENT' && b.bankAccountId === acc.id),
        periods,
      ),
    ),
  ];

  return { periods: keys, rows };
}
