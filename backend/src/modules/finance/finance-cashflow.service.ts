/**
 * Flujo de caja proyectado (tesorería).
 *
 * Parte del saldo bancario actual y proyecta, semana a semana, el saldo de caja
 * combinando: cuentas por cobrar/pagar pendientes con vencimiento + ocurrencias
 * futuras de ingresos/gastos recurrentes. Responde la pregunta ejecutiva
 * "¿cuándo me quedo corto de caja?".
 *
 * Es una PROYECCIÓN (caja), no contabilidad: usa las fechas de vencimiento como
 * mejor estimación del momento del movimiento. Los vencidos (dueDate en el
 * pasado) se pliegan a la primera semana —se esperan pronto— y se exponen aparte
 * para transparencia. Los recurrentes se proyectan estrictamente DESPUÉS de su
 * vencimiento ancla para no duplicar el tramo datado.
 */
import type { RecurrenceFrequency } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { INCOME_PENDING, EXPENSE_PENDING } from './finance-shared';
import { getConsolidated } from './finance-summary.service';
import { currentPeriod, periodRange, periodKey } from '../shared/period';

const DIA_MS = 86_400_000;
const DEFAULT_WEEKS = 8;
const MIN_WEEKS = 4;
const MAX_WEEKS = 12;

export interface CashflowWeek {
  weekKey: string;
  startDate: string; // ISO del lunes
  endDate: string; // ISO del domingo
  expectedIn: number; // cobros datados (vencidos plegados a la semana 1)
  expectedOut: number; // pagos datados
  recurringIn: number; // ingresos recurrentes proyectados
  recurringOut: number; // gastos recurrentes proyectados
  net: number;
  closingBalance: number; // saldo proyectado acumulado
}

export interface Cashflow {
  horizonWeeks: number;
  startingCash: number;
  generatedAt: string;
  weeks: CashflowWeek[];
  minBalance: number;
  minBalanceWeek: string | null;
  firstShortfallWeek: string | null; // primera semana con saldo < 0
  overdueFoldedIn: { receivable: number; payable: number };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Suma una frecuencia de recurrencia a una fecha (aritmética de calendario UTC). */
function addFrequency(d: Date, f: RecurrenceFrequency): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  switch (f) {
    case 'WEEKLY':
      return new Date(d.getTime() + 7 * DIA_MS);
    case 'MONTHLY':
      return new Date(Date.UTC(y, m + 1, day));
    case 'QUARTERLY':
      return new Date(Date.UTC(y, m + 3, day));
    case 'YEARLY':
      return new Date(Date.UTC(y + 1, m, day));
  }
}

export async function getCashflow(filters: {
  organizationId?: string;
  weeks?: number;
}): Promise<Cashflow> {
  const horizon = clamp(Math.trunc(filters.weeks ?? DEFAULT_WEEKS), MIN_WEEKS, MAX_WEEKS);
  const org = filters.organizationId;

  // Semanas contiguas del horizonte, desde la semana en curso (Santiago).
  const startKey = currentPeriod('week');
  const projectionStart = periodRange('week', startKey).gte;
  const horizonEnd = new Date(projectionStart.getTime() + horizon * 7 * DIA_MS); // exclusivo

  const weekKeys: string[] = [];
  for (let i = 0; i < horizon; i++) {
    weekKeys.push(periodKey('week', new Date(projectionStart.getTime() + i * 7 * DIA_MS)));
  }
  const weekIndex = new Map(weekKeys.map((k, i) => [k, i]));

  const inBucket = new Array<number>(horizon).fill(0);
  const outBucket = new Array<number>(horizon).fill(0);
  const recInBucket = new Array<number>(horizon).fill(0);
  const recOutBucket = new Array<number>(horizon).fill(0);
  let overdueReceivable = 0;
  let overduePayable = 0;

  // Índice de la semana de una fecha; los vencidos (antes del horizonte) → semana 0.
  const bucketOf = (d: Date): number | null => {
    const idx = weekIndex.get(periodKey('week', d));
    if (idx !== undefined) return idx;
    return d.getTime() < projectionStart.getTime() ? 0 : null;
  };
  const effectiveIncome = (r: { netAmount: number | null; amount: number }) =>
    r.netAmount && r.netAmount > 0 ? r.netAmount : r.amount;

  const [consolidated, pendingIncome, pendingExpense, recurringIncome, recurringExpense] =
    await Promise.all([
      // Saldo inicial: caja bancaria actual del ámbito (reutiliza el cálculo único).
      getConsolidated({ organizationId: org, granularity: 'week', period: startKey }),
      // Cuentas por cobrar pendientes con vencimiento dentro del horizonte (o vencidas).
      prisma.incomeRecord.findMany({
        where: {
          organizationId: org,
          documentKind: { not: 'CREDIT_NOTE' },
          dueDate: { lt: horizonEnd },
          OR: [
            { paidDate: null, netAmount: { gt: 0 }, status: { not: 'CANCELLED' } },
            { netAmount: null, status: { in: INCOME_PENDING } },
          ],
        },
        select: { dueDate: true, amount: true, netAmount: true },
      }),
      // Cuentas por pagar pendientes con vencimiento dentro del horizonte (o vencidas).
      prisma.expenseRecord.findMany({
        where: {
          organizationId: org,
          status: { in: EXPENSE_PENDING },
          dueDate: { lt: horizonEnd },
        },
        select: { dueDate: true, amount: true },
      }),
      // Ingresos recurrentes (para proyectar ocurrencias futuras).
      prisma.incomeRecord.findMany({
        where: {
          organizationId: org,
          isRecurring: true,
          recurrenceFrequency: { not: null },
          documentKind: { not: 'CREDIT_NOTE' },
          status: { not: 'CANCELLED' },
        },
        select: {
          dueDate: true,
          incomeDate: true,
          amount: true,
          netAmount: true,
          recurrenceFrequency: true,
        },
      }),
      // Gastos recurrentes.
      prisma.expenseRecord.findMany({
        where: {
          organizationId: org,
          isRecurring: true,
          recurrenceFrequency: { not: null },
          status: { not: 'CANCELLED' },
        },
        select: {
          dueDate: true,
          expenseDate: true,
          amount: true,
          recurrenceFrequency: true,
        },
      }),
    ]);

  // Cobros/pagos datados.
  for (const r of pendingIncome) {
    if (!r.dueDate) continue;
    const idx = bucketOf(r.dueDate);
    if (idx === null) continue;
    const amt = effectiveIncome(r);
    inBucket[idx] += amt;
    if (r.dueDate.getTime() < projectionStart.getTime()) overdueReceivable += amt;
  }
  for (const r of pendingExpense) {
    if (!r.dueDate) continue;
    const idx = bucketOf(r.dueDate);
    if (idx === null) continue;
    outBucket[idx] += r.amount;
    if (r.dueDate.getTime() < projectionStart.getTime()) overduePayable += r.amount;
  }

  // Recurrentes: ocurrencias futuras (estrictamente después del ancla) dentro del horizonte.
  const projectRecurring = (
    anchor: Date | null,
    freq: RecurrenceFrequency | null,
    amount: number,
    bucket: number[],
  ) => {
    if (!anchor || !freq) return;
    let occ = addFrequency(anchor, freq);
    let guard = 0;
    while (occ.getTime() < horizonEnd.getTime() && guard < 120) {
      guard++;
      if (occ.getTime() >= projectionStart.getTime()) {
        const idx = weekIndex.get(periodKey('week', occ));
        if (idx !== undefined) bucket[idx] += amount;
      }
      occ = addFrequency(occ, freq);
    }
  };
  for (const r of recurringIncome) {
    projectRecurring(r.dueDate ?? r.incomeDate, r.recurrenceFrequency, effectiveIncome(r), recInBucket);
  }
  for (const r of recurringExpense) {
    projectRecurring(r.dueDate ?? r.expenseDate, r.recurrenceFrequency, r.amount, recOutBucket);
  }

  // Saldo acumulado semana a semana.
  const startingCash = consolidated.cash;
  let running = startingCash;
  const weeks: CashflowWeek[] = weekKeys.map((key, i) => {
    const { gte, lt } = periodRange('week', key);
    const net = inBucket[i] + recInBucket[i] - outBucket[i] - recOutBucket[i];
    running += net;
    return {
      weekKey: key,
      startDate: gte.toISOString(),
      endDate: new Date(lt.getTime() - DIA_MS).toISOString(),
      expectedIn: inBucket[i],
      expectedOut: outBucket[i],
      recurringIn: recInBucket[i],
      recurringOut: recOutBucket[i],
      net,
      closingBalance: running,
    };
  });

  const minWeek = weeks.reduce((m, w) => (w.closingBalance < m.closingBalance ? w : m), weeks[0]);
  const shortfall = weeks.find((w) => w.closingBalance < 0);

  return {
    horizonWeeks: horizon,
    startingCash,
    generatedAt: new Date().toISOString(),
    weeks,
    minBalance: minWeek.closingBalance,
    minBalanceWeek: minWeek.weekKey,
    firstShortfallWeek: shortfall?.weekKey ?? null,
    overdueFoldedIn: { receivable: overdueReceivable, payable: overduePayable },
  };
}
