import { describe, expect, test } from 'vitest';
import {
  normalizeMoney,
  normalizeRut,
  normalizeDate,
  classifyDocumentKind,
  parseSalesRows,
  parsePurchaseRows,
  parseBankRows,
} from '../src/modules/finance-imports/finance-imports.parser';

// ---------------------------------------------------------------------------
// Funciones puras de normalización (caracterización del comportamiento actual)
// ---------------------------------------------------------------------------
describe('normalizeMoney', () => {
  test('número entero se redondea sin tocar el valor', () => {
    expect(normalizeMoney(168179)).toBe(168179);
  });
  test('separador de miles con puntos', () => {
    expect(normalizeMoney('1.681.790')).toBe(1681790);
  });
  test('símbolo de peso y espacios se descartan', () => {
    expect(normalizeMoney('$ 25.450')).toBe(25450);
  });
  test('montos negativos (notas de crédito)', () => {
    expect(normalizeMoney('-25.000')).toBe(-25000);
  });
  test('vacío devuelve 0', () => {
    expect(normalizeMoney('')).toBe(0);
  });
});

describe('normalizeRut', () => {
  test('quita puntos y deja el guión', () => {
    expect(normalizeRut('15.710.922-7')).toBe('15710922-7');
  });
  test('recorta espacios y pone en mayúscula el dígito verificador', () => {
    expect(normalizeRut(' 97036000-K ')).toBe('97036000-K');
  });
});

describe('normalizeDate', () => {
  test('formato dd-mm-yyyy se interpreta como fecha ISO', () => {
    const date = normalizeDate('30-01-2026');
    expect(date?.toISOString().slice(0, 10)).toBe('2026-01-30');
  });
  test('un Date se devuelve tal cual', () => {
    const original = new Date(Date.UTC(2026, 0, 30));
    expect(normalizeDate(original)).toBe(original);
  });
  test('cadena vacía devuelve null', () => {
    expect(normalizeDate('')).toBeNull();
  });
});

describe('classifyDocumentKind', () => {
  test('nota de crédito', () => {
    expect(classifyDocumentKind('Nota de Crédito Electrónica')).toBe('CREDIT_NOTE');
  });
  test('factura normal es SALE', () => {
    expect(classifyDocumentKind('Factura Electrónica')).toBe('SALE');
  });
});

// ---------------------------------------------------------------------------
// parseSalesRows / parsePurchaseRows / parseBankRows — una fila representativa
// ---------------------------------------------------------------------------
describe('parseSalesRows', () => {
  test('fila de venta emitida y completa queda VALID con status de datos INVOICED', () => {
    const preview = parseSalesRows([
      {
        DOCUMENTO: 'Factura Electrónica',
        FOLIO: '123',
        RUT: '76.222.222-2',
        FECHA: '30-01-2026',
        TOTAL: '1.681.790',
        EMITIDO: 'SI',
        'RAZON SOCIAL': 'Cliente X',
        'TIPO DE MONEDA': 'CLP',
      },
    ], 'org-1');

    expect(preview.rows).toHaveLength(1);
    const row = preview.rows[0];
    expect(row.status).toBe('VALID');
    expect(row.warnings).toEqual([]);
    expect(row.data.amount).toBe(1681790);
    expect(row.data.documentKind).toBe('SALE');
    // Por diseño: la venta nace por cobrar (INVOICED), el libro no declara pago.
    expect(row.data.status).toBe('INVOICED');
    expect(row.data.clientName).toBe('Cliente X');
    expect(row.data.sourceRut).toBe('76222222-2');
    expect(row.dedupeKey).toBe(
      'org-1|SALES_REPORT|Factura Electrónica|123|76222222-2|2026-01-30|1681790',
    );
    expect(preview.totalIncome).toBe(1681790);
  });

  test('la clave de ventas lleva la empresa delante', () => {
    const fila = {
      DOCUMENTO: 'FACTURA', FOLIO: '100', RUT: '76.543.210-9',
      FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
    };
    const a = parseSalesRows([fila], 'org-A').rows[0].dedupeKey;
    const b = parseSalesRows([fila], 'org-B').rows[0].dedupeKey;
    // Ojo con el RUT: normalizeRut (parser.ts:109) quita los puntos, así que la
    // clave lleva 76543210-9, NO 76.543.210-9. Si ves rojo aquí, el que está mal
    // es este literal, no normalizeRut: tocarlo rompería parser.test.ts:92 y
    // cambiaría comportamiento real dentro de una tarea que no lo pretende.
    expect(a).toBe('org-A|SALES_REPORT|FACTURA|100|76543210-9|2026-07-06|119000');
    // El punto entero del arreglo: la MISMA factura en dos empresas ya no colisiona.
    expect(a).not.toBe(b);
  });

  test('dos filas idénticas: la segunda se marca DUPLICATE', () => {
    const fila = {
      DOCUMENTO: 'FACTURA', FOLIO: '100', RUT: '76.543.210-9',
      FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
    };
    const res = parseSalesRows([fila, { ...fila }], 'org-1');
    expect(res.rows[0].status).toBe('VALID');
    expect(res.rows[1].status).toBe('DUPLICATE');
    expect(res.rows[1].dedupeKey).toBe(res.rows[0].dedupeKey);
  });

  test('filas distintas no se marcan duplicadas', () => {
    const base = {
      DOCUMENTO: 'FACTURA', RUT: '76.543.210-9',
      FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
    };
    const res = parseSalesRows(
      [{ ...base, FOLIO: '100' }, { ...base, FOLIO: '101' }],
      'org-1',
    );
    expect(res.rows.map((r) => r.status)).toEqual(['VALID', 'VALID']);
  });

  test('fila no emitida queda en ERROR', () => {
    const preview = parseSalesRows([
      {
        DOCUMENTO: 'Factura Electrónica',
        FOLIO: '124',
        RUT: '76.222.222-2',
        FECHA: '30-01-2026',
        TOTAL: '1000',
        EMITIDO: 'NO',
      },
    ], 'org-1');
    expect(preview.rows[0].status).toBe('ERROR');
    expect(preview.rows[0].warnings).toContain('Documento no emitido');
  });
});

describe('parsePurchaseRows', () => {
  test('fila de compra completa queda VALID con status de datos PENDING', () => {
    const preview = parsePurchaseRows([
      {
        DOCUMENTO: 'Factura',
        FOLIO: '55',
        RUT: '76.333.333-3',
        'FECHA DOCUMENTO': '30-01-2026',
        'FECHA VENCIMIENTO': '28-02-2026',
        TOTAL: '50.000',
        'RAZON SOCIAL': 'Proveedor X',
      },
    ], 'org-1');

    expect(preview.rows).toHaveLength(1);
    const row = preview.rows[0];
    expect(row.status).toBe('VALID');
    expect(row.warnings).toEqual([]);
    expect(row.data.amount).toBe(50000);
    expect(row.data.vendorName).toBe('Proveedor X');
    expect(row.data.sourceRut).toBe('76333333-3');
    // Por diseño: la compra nace pendiente de pago (PENDING).
    expect(row.data.status).toBe('PENDING');
    expect(row.data.category).toBe('Compras');
    expect(row.dedupeKey).toBe(
      'org-1|PURCHASE_REPORT|Factura|55|76333333-3|2026-01-30|50000',
    );
    expect(preview.totalExpense).toBe(50000);
  });
});

describe('parseBankRows', () => {
  test('movimiento con fecha y descripción queda VALID', () => {
    const preview = parseBankRows(
      [
        {
          Fecha: '30-01-2026',
          Descripcion: 'Abono cliente',
          'Cargos (CLP)': '',
          'Abonos (CLP)': '100.000',
          'Saldo (CLP)': '500.000',
        },
      ],
      'acc-1',
    );

    expect(preview.rows).toHaveLength(1);
    const row = preview.rows[0];
    expect(row.status).toBe('VALID');
    expect(row.data.description).toBe('Abono cliente');
    expect(row.data.creditAmount).toBe(100000);
    expect(row.data.chargeAmount).toBe(0);
    expect(row.data.balance).toBe(500000);
    expect(row.dedupeKey).toBe('acc-1|2026-01-30||Abono cliente|0|100000|500000');
    expect(preview.totalCredits).toBe(100000);
  });
});
