import { describe, expect, test } from 'vitest';
import { reconcilePaidStatus } from '../src/modules/shared/ledger';

// monthRange y listMonths se jubilaron en la Fase 3: su cobertura vive ahora en
// period.test.ts (periodRange('month', …) y listPeriods('month', …)).

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
