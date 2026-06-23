import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate,
  normalizeMoney,
  normalizeRut,
  parseBankRows,
  parsePurchaseRows,
  parseSalesRows,
} from '../src/modules/finance-imports/finance-imports.parser';

test('normaliza montos chilenos desde numero y texto', () => {
  assert.equal(normalizeMoney(168179), 168179);
  assert.equal(normalizeMoney('1.681.790'), 1681790);
  assert.equal(normalizeMoney('$ 25.450'), 25450);
  assert.equal(normalizeMoney('-25.000'), -25000);
});

test('normaliza rut removiendo puntos y manteniendo guion', () => {
  assert.equal(normalizeRut('15.710.922-7'), '15710922-7');
  assert.equal(normalizeRut(' 97036000-K '), '97036000-K');
});

test('normaliza fechas dd-mm-yyyy y Date', () => {
  assert.equal(
    normalizeDate('30-01-2026')?.toISOString().slice(0, 10),
    '2026-01-30',
  );
  assert.equal(
    normalizeDate(new Date('2026-02-01T00:00:00.000Z'))
      ?.toISOString()
      .slice(0, 10),
    '2026-02-01',
  );
  assert.equal(normalizeDate(''), null);
});

test('parsea filas de ventas como ingresos', () => {
  const preview = parseSalesRows([
    {
      DOCUMENTO: 'FACTURA NO AFECTA O EXENTA ELECTRONICA',
      FOLIO: '1977',
      FECHA: '30-01-2026',
      RUT: '78.191.550-5',
      'RAZON SOCIAL': 'LABORATORIO CLINICO DIAGNOSTICO CLINILAB LTDA',
      TOTAL: '300000',
      PAGADO: 'NO',
      'FECHA VENCIMIENTO DOCUMENTO': '30-01-2026',
    },
    {
      DOCUMENTO: 'NOTA DE CREDITO ELECTRONICA',
      FOLIO: '822',
      FECHA: '31-01-2026',
      RUT: '15.710.922-7',
      'RAZON SOCIAL': 'CARLA MORENO ARANCIBIA',
      TOTAL: '-25000',
      PAGADO: 'NO',
    },
  ]);

  assert.equal(preview.rowsTotal, 2);
  assert.equal(preview.rowsValid, 2);
  assert.equal(preview.totalIncome, 275000);
  assert.equal(preview.rows[0].data.status, 'INVOICED');
  assert.equal(
    preview.rows[0].data.clientName,
    'LABORATORIO CLINICO DIAGNOSTICO CLINILAB LTDA',
  );
});

test('parsea filas de compras como gastos', () => {
  const preview = parsePurchaseRows([
    {
      DOCUMENTO: 'FACTURA ELECTRONICA',
      FOLIO: '5351863',
      'FECHA DOCUMENTO': '30-01-2026',
      'FECHA VENCIMIENTO': '',
      RUT: '77190692-3',
      'RAZON SOCIAL':
        'SOCIEDAD OPERADORA DE TARJETAS DE PAGO SANTANDER GETNET CHILE S.A.',
      TOTAL: '168179',
      PAGADO: 'SI',
    },
  ]);

  assert.equal(preview.rowsTotal, 1);
  assert.equal(preview.rowsValid, 1);
  assert.equal(preview.totalExpense, 168179);
  assert.equal(preview.rows[0].data.status, 'PAID');
  assert.equal(
    preview.rows[0].data.vendorName,
    'SOCIEDAD OPERADORA DE TARJETAS DE PAGO SANTANDER GETNET CHILE S.A.',
  );
});

test('parsea filas de cartola como movimientos bancarios', () => {
  const preview = parseBankRows(
    [
      {
        Fecha: '01-02-2026',
        Descripcion: 'Traspaso A Cuenta: 004210162604',
        'Canal o Sucursal': 'Internet',
        Documento: '123',
        'Cargos (CLP)': '50000',
        'Abonos (CLP)': '',
        'Saldo (CLP)': '950000',
      },
      {
        Fecha: '02-02-2026',
        Descripcion: 'Abono cliente',
        'Canal o Sucursal': 'Internet',
        Documento: '124',
        'Cargos (CLP)': '',
        'Abonos (CLP)': '75000',
        'Saldo (CLP)': '1025000',
      },
    ],
    'bank_1',
  );

  assert.equal(preview.rowsTotal, 2);
  assert.equal(preview.rowsValid, 2);
  assert.equal(preview.totalCharges, 50000);
  assert.equal(preview.totalCredits, 75000);
  assert.equal(preview.rows[0].data.chargeAmount, 50000);
  assert.equal(preview.rows[1].data.creditAmount, 75000);
});
