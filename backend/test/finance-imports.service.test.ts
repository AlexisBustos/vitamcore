import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeImportBatch } from './fixtures';
import { prisma } from '../src/lib/prisma';
import * as imports from '../src/modules/finance-imports/finance-imports.service';
import { parseSalesRows } from '../src/modules/finance-imports/finance-imports.parser';
import { serializeRows } from '../src/modules/finance-imports/finance-imports.serde';

beforeEach(resetDb);
afterAll(disconnect);

// StoredPreviewRow (según serializeRows/createRow): { status, dedupeKey,
// warnings, data, rawData }. `previewData` es un array JSON de estas filas.
// confirmImport inserta las filas VALID/WARNING; DUPLICATE y ERROR se saltan.
// El dedupe real se produce por el @unique global de `sourceDedupeKey`
// (IncomeRecord/ExpenseRecord): un choque lanza P2002 y createRow lo cuenta
// como duplicado (no inserta).

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
        periodMonth: new Date('2026-07-01'),
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
        periodMonth: new Date('2026-07-01'),
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
        periodMonth: new Date('2026-07-01'),
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

  test('dedupe: un sourceDedupeKey ya existente aborta la transacción y confirmImport falla', async () => {
    // Comportamiento ACTUAL (caracterización): aunque createRow captura el
    // P2002 y devuelve false, el error ya abortó la transacción de Postgres.
    // Las consultas posteriores dentro del mismo $transaction (linkCreditNotes
    // en ventas, o el update final del lote) fallan con 25P02, por lo que
    // confirmImport lanza y la transacción hace rollback completo.
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
        dedupeKey: 'sale-dup',
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
    ];
    const batch = await prisma.financialImportBatch.create({
      data: {
        organizationId: org.id,
        type: 'SALES_REPORT',
        status: 'PREVIEW',
        periodMonth: new Date('2026-07-01'),
        originalFileName: 'ventas.xlsx',
        fileSize: 1,
        sourceHash: 'hash-sale-dup',
        previewData: previewData as never,
      },
    });

    await expect(imports.confirmImport(batch.id)).rejects.toThrow();

    // Rollback: solo queda el ingreso preexistente y el lote sigue en PREVIEW.
    const incomes = await prisma.incomeRecord.findMany({ where: { organizationId: org.id } });
    expect(incomes).toHaveLength(1);
    expect(incomes[0].description).toBe('Ingreso previo');
    const after = await prisma.financialImportBatch.findUnique({ where: { id: batch.id } });
    expect(after?.status).toBe('PREVIEW');
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
        periodMonth: new Date('2026-07-01'),
        originalFileName: 'compras.xlsx',
        fileSize: 1,
        sourceHash: 'hash-confirmed',
        previewData: [] as never,
      },
    });
    await expect(imports.confirmImport(batch.id)).rejects.toThrow();
  });
});
