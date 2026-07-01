import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeIncome, makeExpense } from './fixtures';
import { reconcilePaidStatus, monthRange, listMonths } from '../src/modules/shared/ledger';

describe('reconcilePaidStatus', () => {
  test('status undefined devuelve el input sin tocar paidDate', () => {
    const input = { amount: 100, paidDate: undefined };
    const res = reconcilePaidStatus(input, new Date('2026-07-01'));
    expect(res).toBe(input);
    expect('paidDate' in res && res.paidDate).toBe(undefined);
  });

  test('PAID sin fecha previa fija una fecha (hoy)', () => {
    const before = Date.now();
    const res = reconcilePaidStatus({ status: 'PAID' }, null);
    expect(res.paidDate).toBeInstanceOf(Date);
    expect((res.paidDate as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  test('PAID con fecha existente la preserva', () => {
    const existing = new Date('2026-06-15T00:00:00.000Z');
    const res = reconcilePaidStatus({ status: 'PAID' }, existing);
    expect(res.paidDate).toBe(existing);
  });

  test('estado no PAID limpia paidDate y paidByBankTransactionId', () => {
    const res = reconcilePaidStatus({ status: 'INVOICED' }, new Date('2026-07-01'));
    expect(res.paidDate).toBe(null);
    expect(res.paidByBankTransactionId).toBe(null);
  });
});

describe('monthRange', () => {
  test('2026-07 devuelve [julio, agosto) en UTC', () => {
    const { gte, lt } = monthRange('2026-07');
    expect(gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('listMonths', () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  test('income devuelve meses con datos, descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-06-10') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-05') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-20') });
    const meses = await listMonths('income', org.id);
    expect(meses).toEqual(['2026-07', '2026-06']);
  });

  test('expense devuelve meses con datos, descendente', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { expenseDate: new Date('2026-05-10') });
    await makeExpense(org.id, { expenseDate: new Date('2026-07-05') });
    const meses = await listMonths('expense', org.id);
    expect(meses).toEqual(['2026-07', '2026-05']);
  });
});
