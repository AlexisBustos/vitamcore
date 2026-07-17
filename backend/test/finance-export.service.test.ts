import { describe, expect, test, beforeEach, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import { resetDb, disconnect } from './db';
import { makeOrg, makeIncome, makeExpense } from './fixtures';
import {
  exportIncome,
  exportExpenses,
  exportReport,
} from '../src/modules/finance-export/finance-export.service';

beforeEach(resetDb);
afterAll(disconnect);

/** Lee un buffer xlsx y devuelve las hojas como arrays de filas (aoa). */
function readSheets(buffer: Buffer): Record<string, unknown[][]> {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out: Record<string, unknown[][]> = {};
  for (const name of wb.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as unknown[][];
  }
  return out;
}

describe('exportIncome', () => {
  test('genera hoja "Ingresos" con cabecera y una fila de datos', async () => {
    const org = await makeOrg('Vitam Test');
    await makeIncome(org.id, {
      description: 'Consultoría julio',
      amount: 1190000,
      incomeDate: new Date('2026-07-08'),
      clientName: 'Cliente ACME',
    });

    const sheets = readSheets(await exportIncome({ granularity: 'month' }));
    expect(Object.keys(sheets)).toEqual(['Ingresos']);
    const [header, ...rows] = sheets['Ingresos'];
    expect(header).toContain('Descripción');
    expect(header).toContain('Monto');
    expect(rows).toHaveLength(1);
    // El monto se exporta como número (para poder sumar en Excel).
    expect(rows[0]).toContain(1190000);
    expect(rows[0]).toContain('Consultoría julio');
    expect(rows[0]).toContain('Cliente ACME');
  });

  test('sin datos, la hoja conserva la cabecera', async () => {
    const sheets = readSheets(await exportIncome({ granularity: 'month' }));
    expect(sheets['Ingresos'][0]).toContain('Descripción');
    expect(sheets['Ingresos']).toHaveLength(1); // solo cabecera
  });
});

describe('exportExpenses', () => {
  test('genera hoja "Gastos" con proveedor y monto', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { description: 'Arriendo', amount: 800000, vendorName: 'Inmobiliaria X' });
    const sheets = readSheets(await exportExpenses({ granularity: 'month' }));
    expect(Object.keys(sheets)).toEqual(['Gastos']);
    expect(sheets['Gastos'][0]).toContain('Proveedor');
    expect(sheets['Gastos'][1]).toContain('Inmobiliaria X');
    expect(sheets['Gastos'][1]).toContain(800000);
  });
});

describe('exportReport', () => {
  test('genera las 3 hojas del reporte consolidado', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { amount: 500000, incomeDate: new Date('2026-07-08') });
    const sheets = readSheets(await exportReport({ granularity: 'month' }));
    expect(Object.keys(sheets)).toEqual(['Resumen', 'Posición', 'Tendencia']);
    expect(sheets['Resumen'][0]).toEqual(['Concepto', 'Valor (CLP)']);
    expect(sheets['Tendencia'][0]).toContain('Resultado');
    // La tendencia trae 12 períodos + cabecera.
    expect(sheets['Tendencia']).toHaveLength(13);
  });
});
