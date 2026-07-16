import { describe, expect, test, beforeEach, afterAll } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg, makeIncome, makeExpense, makeBankAccount, makeBankTransaction, makeImportBatch,
} from './fixtures';
import {
  periodRange,
  periodKey,
  currentPeriod,
  periodSeries,
  listPeriods,
  isFullIsoWeek,
} from '../src/modules/shared/period';

describe('periodRange mes', () => {
  // Caracterización: valores literales que devuelve el monthRange de HOY.
  // No se compara contra monthRange en vivo porque tras la Task 3 es un alias
  // de esta misma función: compararlos sería compararla consigo misma.
  test('2026-07 devuelve [julio, agosto) en UTC', () => {
    const { gte, lt } = periodRange('month', '2026-07');
    expect(gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  test('2026-12 cruza el año', () => {
    const { gte, lt } = periodRange('month', '2026-12');
    expect(gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  test('mes inexistente lanza badRequest', () => {
    expect(() => periodRange('month', '2026-13')).toThrow(/Mes inexistente/);
  });
});

describe('periodRange semana', () => {
  test('2026-W28 va de lunes 6 a lunes 13 de julio', () => {
    const { gte, lt } = periodRange('week', '2026-W28');
    expect(gte.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  // Borde de año ISO: la semana 1 es la que contiene el 4 de enero.
  test('2026-W01 empieza el 29 de diciembre de 2025', () => {
    const { gte } = periodRange('week', '2026-W01');
    expect(gte.toISOString()).toBe('2025-12-29T00:00:00.000Z');
  });

  test('2026-W53 existe (2026 tiene 53 semanas ISO)', () => {
    const { gte } = periodRange('week', '2026-W53');
    expect(gte.toISOString()).toBe('2026-12-28T00:00:00.000Z');
  });

  test('2025-W53 no existe (2025 tiene 52) y lanza badRequest', () => {
    expect(() => periodRange('week', '2025-W53')).toThrow(/Semana inexistente/);
  });
});

describe('periodKey', () => {
  test('mes', () => {
    expect(periodKey('month', new Date('2026-07-20T00:00:00Z'))).toBe('2026-07');
  });

  test('semana: el domingo cierra su semana', () => {
    expect(periodKey('week', new Date('2026-07-12T00:00:00Z'))).toBe('2026-W28');
  });

  test('semana: el lunes abre la siguiente', () => {
    expect(periodKey('week', new Date('2026-07-13T00:00:00Z'))).toBe('2026-W29');
  });

  // El 31-dic-2026 es jueves: cae en la semana 53 de 2026.
  test('semana: 31-dic-2026 es 2026-W53', () => {
    expect(periodKey('week', new Date('2026-12-31T00:00:00Z'))).toBe('2026-W53');
  });

  // El 1-ene-2027 es viernes: sigue en la semana 53 de 2026, NO en 2027-W01.
  test('semana: 1-ene-2027 sigue siendo 2026-W53', () => {
    expect(periodKey('week', new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });

  test('semana: 29-dic-2025 ya es 2026-W01', () => {
    expect(periodKey('week', new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01');
  });

  test('ida y vuelta: periodKey(periodRange(k).gte) === k', () => {
    for (const k of ['2026-W01', '2026-W28', '2026-W53', '2027-W01']) {
      expect(periodKey('week', periodRange('week', k).gte)).toBe(k);
    }
  });
});

describe('currentPeriod', () => {
  // A las 23:00 en Santiago (UTC-4) ya es el día siguiente en UTC.
  // Debe ganar Santiago: el CEO sigue en el día 12, no en el 13.
  test('23:00 del domingo en Santiago sigue en la semana que cierra', () => {
    const now = new Date('2026-07-13T03:00:00Z'); // 12-jul 23:00 en Santiago
    expect(currentPeriod('week', now)).toBe('2026-W28');
  });

  test('00:30 del lunes en Santiago ya es la semana siguiente', () => {
    const now = new Date('2026-07-13T04:30:00Z'); // 13-jul 00:30 en Santiago
    expect(currentPeriod('week', now)).toBe('2026-W29');
  });

  // El bug de currentMonthRange: a las 23:00 del 31 en Santiago, UTC ya es día 1
  // del mes siguiente. El mes correcto es julio, no agosto.
  test('23:00 del 31 en Santiago sigue en el mes que cierra', () => {
    const now = new Date('2026-08-01T03:00:00Z'); // 31-jul 23:00 en Santiago
    expect(currentPeriod('month', now)).toBe('2026-07');
  });
});

describe('periodSeries', () => {
  test('meses contiguos cruzando el año', () => {
    expect(periodSeries('month', '2026-11', '2027-02')).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02',
    ]);
  });

  test('un solo período', () => {
    expect(periodSeries('month', '2026-07', '2026-07')).toEqual(['2026-07']);
  });

  test('semanas contiguas cruzando el año (2026 tiene 53)', () => {
    expect(periodSeries('week', '2026-W52', '2027-W02')).toEqual([
      '2026-W52', '2026-W53', '2027-W01', '2027-W02',
    ]);
  });

  test('rango invertido devuelve vacío', () => {
    expect(periodSeries('month', '2026-07', '2026-05')).toEqual([]);
  });
});

describe('isFullIsoWeek', () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

  test('lunes 6 a domingo 12 de julio 2026 es semana completa', () => {
    expect(isFullIsoWeek(d('2026-07-06'), d('2026-07-12'))).toBe(true);
  });

  test('lunes 6 a sábado 11 no es semana completa (falta un día)', () => {
    expect(isFullIsoWeek(d('2026-07-06'), d('2026-07-11'))).toBe(false);
  });

  test('martes 7 a lunes 13 no es semana completa (no empieza en lunes)', () => {
    expect(isFullIsoWeek(d('2026-07-07'), d('2026-07-13'))).toBe(false);
  });

  test('un mes completo no es semana', () => {
    expect(isFullIsoWeek(d('2026-07-01'), d('2026-07-31'))).toBe(false);
  });
});

// makeBankTransaction (fixtures.ts:77) recibe un OBJETO, no posicionales, y
// exige importBatchId: es FK obligatoria (schema.prisma:791) y no tiene default.
// Este helper crea el lote una vez y devuelve un atajo por cuenta.
async function movimientosDe(organizationId: string) {
  const lote = await makeImportBatch(organizationId, { type: 'BANK_STATEMENT' });
  return (bankAccountId: string, overrides: Record<string, unknown> = {}) =>
    makeBankTransaction(
      { organizationId, bankAccountId, importBatchId: lote.id },
      overrides,
    );
}

describe('listPeriods', () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  test('income por mes, descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-06-10') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-05') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-20') });
    expect(await listPeriods('month', { source: 'income', organizationId: org.id }))
      .toEqual(['2026-07', '2026-06']);
  });

  test('income por semana, descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-07-06') }); // W28
    await makeIncome(org.id, { incomeDate: new Date('2026-07-12') }); // W28
    await makeIncome(org.id, { incomeDate: new Date('2026-07-13') }); // W29
    expect(await listPeriods('week', { source: 'income', organizationId: org.id }))
      .toEqual(['2026-W29', '2026-W28']);
  });

  test('expense por mes', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { expenseDate: new Date('2026-05-10') });
    await makeExpense(org.id, { expenseDate: new Date('2026-07-05') });
    expect(await listPeriods('month', { source: 'expense', organizationId: org.id }))
      .toEqual(['2026-07', '2026-05']);
  });

  test('bank filtra por cuenta', async () => {
    const org = await makeOrg();
    const a = await makeBankAccount(org.id, { accountNumber: '111' });
    const b = await makeBankAccount(org.id, { accountNumber: '222' });
    const mov = await movimientosDe(org.id);
    await mov(a.id, { transactionDate: new Date('2026-07-06') });
    await mov(b.id, { transactionDate: new Date('2026-06-10') });
    expect(await listPeriods('month', { source: 'bank', bankAccountId: a.id }))
      .toEqual(['2026-07']);
    expect(await listPeriods('month', { source: 'bank', organizationId: org.id }))
      .toEqual(['2026-07', '2026-06']);
  });

  // El borde de año ISO tiene que salir bien también desde Postgres (IYYY/IW),
  // no solo desde la aritmética de JS. Con 'YYYY-WW' esto daría 2027-W01 y las
  // dos capas discreparían justo en el borde.
  test('bank: el 1-ene-2027 se agrupa en 2026-W53, como en periodKey', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, { transactionDate: new Date('2027-01-01') });
    expect(await listPeriods('week', { source: 'bank', organizationId: org.id }))
      .toEqual(['2026-W53']);
  });

  test('sin datos devuelve vacío', async () => {
    const org = await makeOrg();
    expect(await listPeriods('month', { source: 'income', organizationId: org.id }))
      .toEqual([]);
  });
});
