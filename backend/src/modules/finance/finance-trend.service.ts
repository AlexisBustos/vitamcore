/**
 * Tendencia financiera: serie de ingresos/gastos/resultado por período (semana
 * o mes), de los últimos N períodos hasta el actual. Los períodos sin datos van
 * en CERO, no ausentes: un hueco en la serie es información (spec §4).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  periodRange,
  periodKey,
  currentPeriod,
  periodSeries,
  TRUNC,
  type Granularity,
} from '../shared/period';

const DIA_MS = 86_400_000;

export type TrendPoint = {
  period: string;
  income: number;
  expense: number;
  result: number;
};

/** Clave del período `n` períodos antes de `key` (misma granularidad). */
function shiftBack(g: Granularity, key: string, n: number): string {
  if (g === 'week') {
    const gte = periodRange('week', key).gte;
    return periodKey('week', new Date(gte.getTime() - n * 7 * DIA_MS));
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  const year = Number(m![1]);
  const month = Number(m![2]);
  return periodKey('month', new Date(Date.UTC(year, month - 1 - n, 1)));
}

/** Suma de `amount` por período en [start, lt), agrupada con la whitelist TRUNC. */
async function sumByPeriod(
  g: Granularity,
  table: 'income_records' | 'expense_records',
  column: 'incomeDate' | 'expenseDate',
  start: Date,
  lt: Date,
  organizationId?: string,
): Promise<Map<string, number>> {
  const { unit, format } = TRUNC[g];
  const col = Prisma.raw(`"${column}"`);
  const conditions = [
    Prisma.sql`${col} >= ${start}`,
    Prisma.sql`${col} < ${lt}`,
    Prisma.sql`status <> 'CANCELLED'`,
  ];
  if (organizationId) {
    conditions.push(Prisma.sql`"organizationId" = ${organizationId}`);
  }
  const rows = await prisma.$queryRaw<{ period: string; total: bigint }[]>(Prisma.sql`
    SELECT to_char(date_trunc(${unit}, ${col}), ${format}) AS period,
           COALESCE(SUM(amount), 0)::bigint AS total
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY 1
  `);
  return new Map(rows.map((r) => [r.period, Number(r.total)]));
}

export async function getTrend(
  filters: {
    granularity: Granularity;
    last: number;
    organizationId?: string;
  },
  now = new Date(),
): Promise<TrendPoint[]> {
  const { granularity: g, last, organizationId } = filters;

  const current = currentPeriod(g, now);
  const startKey = shiftBack(g, current, last - 1);
  const keys = periodSeries(g, startKey, current); // longitud = last

  const start = periodRange(g, startKey).gte;
  const lt = periodRange(g, current).lt;

  const [income, expense] = await Promise.all([
    sumByPeriod(g, 'income_records', 'incomeDate', start, lt, organizationId),
    sumByPeriod(g, 'expense_records', 'expenseDate', start, lt, organizationId),
  ]);

  return keys.map((period) => {
    const inc = income.get(period) ?? 0;
    const exp = expense.get(period) ?? 0;
    return { period, income: inc, expense: exp, result: inc - exp };
  });
}
