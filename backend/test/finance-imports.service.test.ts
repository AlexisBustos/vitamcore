import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeImportBatch } from './fixtures';
import { prisma } from '../src/lib/prisma';
import * as imports from '../src/modules/finance-imports/finance-imports.service';
import { parseSalesRows } from '../src/modules/finance-imports/finance-imports.parser';
import { serializeRows } from '../src/modules/finance-imports/finance-imports.serde';
import * as XLSX from 'xlsx';

/// Arma un XLSX de ventas (hoja DETALLE) en un objeto file como el de multer.
function ventasFile(rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DETALLE');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { originalname: 'ventas.xlsx', size: buffer.length, buffer };
}

const filaVenta = (folio: string, fecha: string) => ({
  DOCUMENTO: 'FACTURA', FOLIO: folio, RUT: '76.543.210-9',
  FECHA: fecha, TOTAL: '119000', EMITIDO: 'SI',
});

beforeEach(resetDb);
afterAll(disconnect);

// StoredPreviewRow (según serializeRows/createRow): { status, dedupeKey,
// warnings, data, rawData }. `previewData` es un array JSON de estas filas.
// confirmImport inserta las filas VALID/WARNING; DUPLICATE y ERROR se saltan.
// El dedupe real ocurre en el PREVIEW (getExistingDedupeKeys contra la BD, y
// el dedupe intra-lote del parser): confirmImport solo inserta lo que llega
// marcado VALID/WARNING. El @unique de `sourceDedupeKey` es la última red: si
// salta, el lote entero hace rollback con un badRequest legible.

// ---------------------------------------------------------------------------
// confirmImport — compras
// ---------------------------------------------------------------------------
describe('confirmImport (compras)', () => {
  test('crea gastos y enlaza proveedor por RUT', async () => {
    const org = await makeOrg();
    const previewData = [
      {
        status: 'VALID',
        dedupeKey: 'buy-1',
        warnings: [],
        data: {
          vendorName: 'Proveedor X',
          sourceRut: '76.222.222-2',
          amount: 50000,
          currency: 'CLP',
          description: 'Factura compra 1',
          category: 'Compras',
          status: 'PENDING',
        },
        rawData: {},
      },
    ];
    const batch = await prisma.financialImportBatch.create({
      data: {
        organizationId: org.id,
        type: 'PURCHASE_REPORT',
        status: 'PREVIEW',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        originalFileName: 'compras.xlsx',
        fileSize: 1,
        sourceHash: 'hash-buy-1',
        previewData: previewData as never,
      },
    });

    const result = await imports.confirmImport(batch.id);
    expect(result.inserted).toBe(1);
    expect(result.duplicated).toBe(0);

    const expenses = await prisma.expenseRecord.findMany({
      where: { organizationId: org.id },
    });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].vendorId).toBeTruthy();
    expect(expenses[0].importBatchId).toBe(batch.id);
    expect(expenses[0].amount).toBe(50000);
    expect(expenses[0].sourceRut).toBe('76.222.222-2');
    expect(expenses[0].sourceDedupeKey).toBe('buy-1');

    // El proveedor se creó y se enlazó por (organización, RUT).
    const vendor = await prisma.vendor.findFirst({ where: { organizationId: org.id } });
    expect(vendor?.id).toBe(expenses[0].vendorId);
    expect(vendor?.rut).toBe('76.222.222-2');

    // El lote queda CONFIRMED.
    const confirmed = await prisma.financialImportBatch.findUnique({ where: { id: batch.id } });
    expect(confirmed?.status).toBe('CONFIRMED');
  });

  test('las filas ERROR y DUPLICATE no se insertan', async () => {
    const org = await makeOrg();
    const previewData = [
      { status: 'ERROR', dedupeKey: 'buy-err', warnings: [], data: { amount: 1 }, rawData: {} },
      { status: 'DUPLICATE', dedupeKey: 'buy-dup', warnings: [], data: { amount: 2 }, rawData: {} },
      {
        status: 'WARNING',
        dedupeKey: 'buy-ok',
        warnings: ['x'],
        data: { vendorName: 'P', sourceRut: '11.111.111-1', amount: 3, description: 'ok' },
        rawData: {},
      },
    ];
    const batch = await prisma.financialImportBatch.create({
      data: {
        organizationId: org.id,
        type: 'PURCHASE_REPORT',
        status: 'PREVIEW',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        originalFileName: 'compras.xlsx',
        fileSize: 1,
        sourceHash: 'hash-buy-2',
        previewData: previewData as never,
      },
    });

    const result = await imports.confirmImport(batch.id);
    expect(result.inserted).toBe(1); // solo la WARNING
    expect(result.duplicated).toBe(1); // la DUPLICATE se cuenta como duplicada

    const expenses = await prisma.expenseRecord.findMany({ where: { organizationId: org.id } });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].sourceDedupeKey).toBe('buy-ok');
  });
});

// ---------------------------------------------------------------------------
// confirmImport — ventas
// ---------------------------------------------------------------------------
describe('confirmImport (ventas)', () => {
  test('crea ingresos y enlaza cliente por RUT', async () => {
    const org = await makeOrg();
    const previewData = [
      {
        status: 'VALID',
        dedupeKey: 'sale-1',
        warnings: [],
        data: {
          clientName: 'Cliente X',
          sourceRut: '77.111.111-1',
          documentKind: 'SALE',
          amount: 120000,
          currency: 'CLP',
          description: 'Factura 1',
          category: 'Ventas',
          status: 'INVOICED',
        },
        rawData: {},
      },
    ];
    const batch = await prisma.financialImportBatch.create({
      data: {
        organizationId: org.id,
        type: 'SALES_REPORT',
        status: 'PREVIEW',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        originalFileName: 'ventas.xlsx',
        fileSize: 1,
        sourceHash: 'hash-sale-1',
        previewData: previewData as never,
      },
    });

    const result = await imports.confirmImport(batch.id);
    expect(result.inserted).toBe(1);

    const incomes = await prisma.incomeRecord.findMany({ where: { organizationId: org.id } });
    expect(incomes).toHaveLength(1);
    expect(incomes[0].clientId).toBeTruthy();
    expect(incomes[0].importBatchId).toBe(batch.id);
    expect(incomes[0].documentKind).toBe('SALE');
    // Factura: netAmount = amount al nacer.
    expect(incomes[0].netAmount).toBe(120000);
    expect(incomes[0].sourceDedupeKey).toBe('sale-1');

    const client = await prisma.client.findFirst({ where: { organizationId: org.id } });
    expect(client?.id).toBe(incomes[0].clientId);
    expect(client?.rut).toBe('77.111.111-1');
  });

  test('dedupe: una clave ya existente en BD se salta y las filas nuevas sí entran', async () => {
    // Carga incremental (mes parcial → mes completo): confirmImport re-chequea las
    // claves contra la BD DENTRO de la transacción y salta las repetidas en vez de
    // reventar el lote. La factura ya cargada se cuenta como duplicada; la nueva se
    // inserta. El lote se confirma igual.
    const org = await makeOrg();
    // Ingreso preexistente con el mismo sourceDedupeKey (unique global).
    await prisma.incomeRecord.create({
      data: {
        organizationId: org.id,
        description: 'Ingreso previo',
        amount: 120000,
        currency: 'CLP',
        status: 'INVOICED',
        incomeDate: new Date('2026-06-01'),
        sourceDedupeKey: 'sale-dup',
      },
    });

    const previewData = [
      {
        status: 'VALID',
        dedupeKey: 'sale-dup', // ya está en la BD → se salta
        warnings: [],
        data: {
          clientName: 'Cliente Y',
          sourceRut: '77.222.222-2',
          documentKind: 'SALE',
          amount: 999,
          description: 'Factura duplicada',
        },
        rawData: {},
      },
      {
        status: 'VALID',
        dedupeKey: 'sale-nuevo', // clave nueva → se inserta
        warnings: [],
        data: {
          clientName: 'Cliente Z',
          sourceRut: '77.333.333-3',
          documentKind: 'SALE',
          amount: 50000,
          description: 'Factura nueva',
        },
        rawData: {},
      },
    ];
    const batch = await prisma.financialImportBatch.create({
      data: {
        organizationId: org.id,
        type: 'SALES_REPORT',
        status: 'PREVIEW',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        originalFileName: 'ventas.xlsx',
        fileSize: 1,
        sourceHash: 'hash-sale-dup',
        previewData: previewData as never,
      },
    });

    const result = await imports.confirmImport(batch.id);
    expect(result.inserted).toBe(1); // solo la nueva
    expect(result.duplicated).toBe(1); // la repetida, saltada

    // Quedan el ingreso preexistente y la factura nueva; la duplicada NO se dobló.
    const incomes = await prisma.incomeRecord.findMany({
      where: { organizationId: org.id },
      orderBy: { amount: 'asc' },
    });
    expect(incomes).toHaveLength(2);
    expect(incomes.map((i) => i.description)).toEqual(['Factura nueva', 'Ingreso previo']);
    const after = await prisma.financialImportBatch.findUnique({ where: { id: batch.id } });
    expect(after?.status).toBe('CONFIRMED');
  });

  test('dos empresas con la misma factura: ambas se guardan', async () => {
    // Este test va directo a confirmImport, así que lo que ejercita es el @unique
    // global de sourceDedupeKey en el insert — NO getExistingDedupeKeys, que solo
    // corre en previewImport. Son las dos caras del mismo defecto: la clave sin
    // empresa. En producción el CEO lo sufriría por la vía del preview (la fila se
    // marca DUPLICATE y se descarta en silencio); aquí se prueba por la vía del
    // insert, que es la que se puede montar sin un XLSX. Ver spec §2.
    const orgA = await makeOrg('Vitam Healthcare');
    const orgB = await makeOrg('Vitam Tech');
    const fila = {
      DOCUMENTO: 'FACTURA', FOLIO: '100', RUT: '76.543.210-9',
      FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
    };

    // CLAVE: las dedupeKey se DERIVAN del parser, no se escriben a mano. Si las
    // escribieras a mano ya saldrían distintas y el test pasaría incluso sin el
    // arreglo: probaría que dos strings distintos insertan dos filas, que es
    // cierto hoy. Lo que se prueba aquí es que el PARSER las hace distintas.
    for (const org of [orgA, orgB]) {
      const preview = parseSalesRows([fila], org.id);
      const lote = await makeImportBatch(org.id, {
        type: 'SALES_REPORT',
        previewData: serializeRows(preview.rows),
      });
      await imports.confirmImport(lote.id);
    }

    expect(await prisma.incomeRecord.count()).toBe(2);
    // Sin el arreglo esto no daría 1: daría excepción. La clave de orgB chocaría
    // con la de orgA (P2002), linkCreditNotes correría después dentro de la misma
    // transacción y moriría con 25P02, así que confirmImport lanzaría. Da igual
    // para el flujo —el test se escribe DESPUÉS de implementar— pero que conste,
    // porque un comentario que miente sobrevive al bug que describe.
  });

  test('lotes solapados sin importar el orden: el segundo salta duplicados e inserta lo nuevo', async () => {
    // Escenario real del CEO: previsualiza el mes parcial y el mes completo ANTES
    // de confirmar ninguno (el segundo preview no ve al primero, así que no marca
    // nada DUPLICATE). Al confirmar ambos, el segundo re-chequea contra la BD
    // dentro de la transacción y salta las facturas ya insertadas en vez de
    // reventar el lote. Antes del arreglo, el segundo confirm lanzaba.
    const org = await makeOrg();

    // Parcial: folios 100 y 101. Completo: 100, 101, 102 y 103 (se solapan).
    const parcial = ventasFile([filaVenta('100', '2026-07-06'), filaVenta('101', '2026-07-10')]);
    const completo = ventasFile([
      filaVenta('100', '2026-07-06'), filaVenta('101', '2026-07-10'),
      filaVenta('102', '2026-07-20'), filaVenta('103', '2026-07-28'),
    ]);
    const rango = { periodStart: new Date('2026-07-01'), periodEnd: new Date('2026-07-31') };

    // Ambos previews ocurren antes de cualquier confirmación.
    const previewParcial = await imports.previewImport(
      { organizationId: org.id, type: 'SALES_REPORT', ...rango },
      parcial,
    );
    const previewCompleto = await imports.previewImport(
      { organizationId: org.id, type: 'SALES_REPORT', ...rango },
      completo,
    );
    // El segundo preview no vio al primero (nada confirmado aún): sus 4 filas VALID.
    expect(previewCompleto.batch.rowsValid).toBe(4);

    const resParcial = await imports.confirmImport(previewParcial.batch.id);
    expect(resParcial.inserted).toBe(2);

    const resCompleto = await imports.confirmImport(previewCompleto.batch.id);
    expect(resCompleto.inserted).toBe(2); // solo 102 y 103
    expect(resCompleto.duplicated).toBe(2); // 100 y 101, saltadas

    // Cuatro facturas en total, sin duplicar las solapadas.
    expect(await prisma.incomeRecord.count({ where: { organizationId: org.id } })).toBe(4);
    const folios = await prisma.incomeRecord.findMany({
      where: { organizationId: org.id },
      select: { sourceFolio: true },
      orderBy: { sourceFolio: 'asc' },
    });
    expect(folios.map((f) => f.sourceFolio)).toEqual(['100', '101', '102', '103']);
  });
});

// ---------------------------------------------------------------------------
// confirmImport — guardas
// ---------------------------------------------------------------------------
describe('confirmImport (guardas)', () => {
  test('un lote ya confirmado no se puede confirmar de nuevo', async () => {
    const org = await makeOrg();
    const batch = await prisma.financialImportBatch.create({
      data: {
        organizationId: org.id,
        type: 'PURCHASE_REPORT',
        status: 'CONFIRMED',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        originalFileName: 'compras.xlsx',
        fileSize: 1,
        sourceHash: 'hash-confirmed',
        previewData: [] as never,
      },
    });
    await expect(imports.confirmImport(batch.id)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// previewImport — rango declarado y advertencias de lote (Fase 2)
// ---------------------------------------------------------------------------
describe('previewImport (rango declarado)', () => {
  const semana = { // lunes 6 a domingo 12 de julio 2026 (semana ISO completa)
    periodStart: new Date('2026-07-06'),
    periodEnd: new Date('2026-07-12'),
  };

  test('semana completa con filas dentro: guarda rango y dataStart/End, sin advertencias', async () => {
    const org = await makeOrg();
    const file = ventasFile([filaVenta('100', '2026-07-06'), filaVenta('101', '2026-07-10')]);
    const res = await imports.previewImport(
      { organizationId: org.id, type: 'SALES_REPORT', ...semana },
      file,
    );
    expect(res.batch.periodStart.toISOString().slice(0, 10)).toBe('2026-07-06');
    expect(res.batch.periodEnd.toISOString().slice(0, 10)).toBe('2026-07-12');
    expect(res.batch.dataStart?.toISOString().slice(0, 10)).toBe('2026-07-06');
    expect(res.batch.dataEnd?.toISOString().slice(0, 10)).toBe('2026-07-10');
    expect(res.batchWarnings).toEqual([]);
  });

  test('fila fuera del rango declarado dispara la advertencia (a)', async () => {
    const org = await makeOrg();
    // Una fila del 28 de junio, fuera de la semana declarada.
    const file = ventasFile([filaVenta('100', '2026-07-06'), filaVenta('200', '2026-06-28')]);
    const res = await imports.previewImport(
      { organizationId: org.id, type: 'SALES_REPORT', ...semana },
      file,
    );
    expect(res.batchWarnings.some((w) => /fuera de ese rango/.test(w))).toBe(true);
  });

  test('rango que no es semana completa dispara la advertencia (c)', async () => {
    const org = await makeOrg();
    const file = ventasFile([filaVenta('100', '2026-07-06')]);
    const res = await imports.previewImport(
      {
        organizationId: org.id, type: 'SALES_REPORT',
        periodStart: new Date('2026-07-06'), periodEnd: new Date('2026-07-31'), // un mes
      },
      file,
    );
    expect(res.batchWarnings.some((w) => /semana completa/.test(w))).toBe(true);
  });

  test('reimportar el mismo archivo confirmado dispara la advertencia (b)', async () => {
    const org = await makeOrg();
    const file = ventasFile([filaVenta('100', '2026-07-06')]);
    const first = await imports.previewImport(
      { organizationId: org.id, type: 'SALES_REPORT', ...semana },
      file,
    );
    await imports.confirmImport(first.batch.id);
    const second = await imports.previewImport(
      { organizationId: org.id, type: 'SALES_REPORT', ...semana },
      file,
    );
    expect(second.batchWarnings.some((w) => /ya se importó/.test(w))).toBe(true);
  });
});
