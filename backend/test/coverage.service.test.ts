import { describe, expect, test, beforeEach, afterAll } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeBankAccount, makeImportBatch } from './fixtures';
import { getCoverage, type CoverageRow } from '../src/modules/finance-imports/coverage.service';

beforeEach(resetDb);
afterAll(disconnect);

// Estado de una celda concreta de una fila.
function cell(row: CoverageRow, period: string) {
  return row.cells.find((c) => c.period === period)?.status;
}
function rowOf(rows: CoverageRow[], type: string, bankAccountId?: string) {
  return rows.find(
    (r) => r.source.type === type && r.source.bankAccountId === bankAccountId,
  )!;
}

describe('getCoverage', () => {
  test('lote CONFIRMED que cubre la semana entera → covered; el resto missing', async () => {
    const org = await makeOrg();
    await makeImportBatch(org.id, {
      type: 'SALES_REPORT',
      status: 'CONFIRMED',
      periodStart: new Date('2026-07-06'), // lunes W28
      periodEnd: new Date('2026-07-12'), // domingo W28
    });

    const { periods, rows } = await getCoverage({
      granularity: 'week',
      from: '2026-W26',
      to: '2026-W29',
    });

    expect(periods).toEqual(['2026-W26', '2026-W27', '2026-W28', '2026-W29']);
    const ventas = rowOf(rows, 'SALES_REPORT');
    expect(cell(ventas, '2026-W28')).toBe('covered');
    expect(cell(ventas, '2026-W26')).toBe('missing');
    expect(cell(ventas, '2026-W27')).toBe('missing');
    expect(cell(ventas, '2026-W29')).toBe('missing');
  });

  test('lote que cubre solo parte de la semana → partial', async () => {
    const org = await makeOrg();
    await makeImportBatch(org.id, {
      type: 'PURCHASE_REPORT',
      status: 'CONFIRMED',
      periodStart: new Date('2026-07-06'),
      periodEnd: new Date('2026-07-08'), // solo 3 de los 7 días
    });

    const { rows } = await getCoverage({ granularity: 'week', from: '2026-W28', to: '2026-W28' });
    expect(cell(rowOf(rows, 'PURCHASE_REPORT'), '2026-W28')).toBe('partial');
  });

  test('los lotes en PREVIEW no cuentan como cubierta', async () => {
    const org = await makeOrg();
    await makeImportBatch(org.id, {
      type: 'SALES_REPORT',
      status: 'PREVIEW', // subido pero no confirmado
      periodStart: new Date('2026-07-06'),
      periodEnd: new Date('2026-07-12'),
    });

    const { rows } = await getCoverage({ granularity: 'week', from: '2026-W28', to: '2026-W28' });
    expect(cell(rowOf(rows, 'SALES_REPORT'), '2026-W28')).toBe('missing');
  });

  test('una semana sin filas pero con lote confirmado cuenta como cubierta', async () => {
    const org = await makeOrg();
    // Lote confirmado con 0 filas (rowsValid default 0): declara que se miró.
    await makeImportBatch(org.id, {
      type: 'SALES_REPORT',
      status: 'CONFIRMED',
      periodStart: new Date('2026-07-06'),
      periodEnd: new Date('2026-07-12'),
      rowsValid: 0,
    });

    const { rows } = await getCoverage({ granularity: 'week', from: '2026-W28', to: '2026-W28' });
    expect(cell(rowOf(rows, 'SALES_REPORT'), '2026-W28')).toBe('covered');
  });

  test('la cobertura bancaria es por cuenta (una fila por cuenta)', async () => {
    const org = await makeOrg();
    const cuentaA = await makeBankAccount(org.id, { name: 'Santander', accountNumber: 'A-1' });
    const cuentaB = await makeBankAccount(org.id, { name: 'BCI', accountNumber: 'B-1' });
    await makeImportBatch(org.id, {
      type: 'BANK_STATEMENT',
      status: 'CONFIRMED',
      bankAccountId: cuentaA.id,
      periodStart: new Date('2026-07-06'),
      periodEnd: new Date('2026-07-12'),
    });

    const { rows } = await getCoverage({ granularity: 'week', from: '2026-W28', to: '2026-W28' });

    // 2 fuentes fijas (ventas, compras) + 2 cuentas bancarias.
    expect(rows).toHaveLength(4);
    expect(cell(rowOf(rows, 'BANK_STATEMENT', cuentaA.id), '2026-W28')).toBe('covered');
    expect(cell(rowOf(rows, 'BANK_STATEMENT', cuentaB.id), '2026-W28')).toBe('missing');
  });
});
