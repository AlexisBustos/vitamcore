import { describe, expect, test, beforeEach, afterAll } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeIncome, makeExpense } from './fixtures';
import { getTrend } from '../src/modules/finance/finance-trend.service';

// "Hoy" fijo: 2026-07-16 (jueves) cae en la semana ISO 2026-W29 (13–19 jul).
const NOW = new Date('2026-07-16T12:00:00.000Z');

beforeEach(resetDb);
afterAll(disconnect);

describe('getTrend (semana)', () => {
  test('serie de longitud `last` terminando en la semana actual, con ceros', async () => {
    const org = await makeOrg();
    // W28 (6–12 jul): ingreso 100.000, gasto 30.000 → resultado 70.000
    await makeIncome(org.id, { incomeDate: new Date('2026-07-08'), amount: 100000 });
    await makeExpense(org.id, { expenseDate: new Date('2026-07-09'), amount: 30000 });
    // W26 (22–28 jun): ingreso 50.000
    await makeIncome(org.id, { incomeDate: new Date('2026-06-24'), amount: 50000 });

    const trend = await getTrend({ granularity: 'week', last: 4 }, NOW);

    expect(trend.map((p) => p.period)).toEqual([
      '2026-W26',
      '2026-W27',
      '2026-W28',
      '2026-W29',
    ]);
    expect(trend[0]).toEqual({ period: '2026-W26', income: 50000, expense: 0, result: 50000 });
    // W27 sin datos → ceros (hueco explícito, no ausente).
    expect(trend[1]).toEqual({ period: '2026-W27', income: 0, expense: 0, result: 0 });
    expect(trend[2]).toEqual({ period: '2026-W28', income: 100000, expense: 30000, result: 70000 });
    expect(trend[3]).toEqual({ period: '2026-W29', income: 0, expense: 0, result: 0 });
  });

  test('los ingresos CANCELLED no cuentan', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-07-08'), amount: 100000, status: 'CANCELLED' });

    const trend = await getTrend({ granularity: 'week', last: 2 }, NOW);
    const w28 = trend.find((p) => p.period === '2026-W28');
    expect(w28?.income ?? 0).toBe(0);
  });

  test('filtra por empresa', async () => {
    const a = await makeOrg('Empresa A');
    const b = await makeOrg('Empresa B');
    await makeIncome(a.id, { incomeDate: new Date('2026-07-08'), amount: 100000 });
    await makeIncome(b.id, { incomeDate: new Date('2026-07-08'), amount: 999000 });

    const trend = await getTrend({ granularity: 'week', last: 2, organizationId: a.id }, NOW);
    const w28 = trend.find((p) => p.period === '2026-W28');
    expect(w28?.income).toBe(100000);
  });

  test('cruza el borde de año ISO', async () => {
    const org = await makeOrg();
    // now a comienzos de enero de 2026 → semana actual 2026-W02.
    const enero = new Date('2026-01-08T12:00:00.000Z'); // 2026-W02
    // 2026-W01 empieza el 29 dic 2025.
    await makeIncome(org.id, { incomeDate: new Date('2025-12-30'), amount: 40000 });

    const trend = await getTrend({ granularity: 'week', last: 3 }, enero);
    expect(trend.map((p) => p.period)).toEqual(['2025-W52', '2026-W01', '2026-W02']);
    expect(trend.find((p) => p.period === '2026-W01')?.income).toBe(40000);
  });
});

describe('getTrend (mes)', () => {
  test('serie mensual con ceros y borde de año', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-01-15'), amount: 80000 });
    await makeExpense(org.id, { expenseDate: new Date('2025-12-10'), amount: 20000 });

    // now en febrero 2026 → mes actual 2026-02.
    const feb = new Date('2026-02-10T12:00:00.000Z');
    const trend = await getTrend({ granularity: 'month', last: 3 }, feb);
    expect(trend.map((p) => p.period)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(trend[0]).toEqual({ period: '2025-12', income: 0, expense: 20000, result: -20000 });
    expect(trend[1]).toEqual({ period: '2026-01', income: 80000, expense: 0, result: 80000 });
  });
});
