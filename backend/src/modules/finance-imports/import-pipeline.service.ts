import { createHash } from 'node:crypto';
import {
  DocumentKind,
  FinancialImportStatus,
  FinancialImportType,
  Prisma,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { categorizeWith } from './finance-imports.categories';
import { getActiveRules } from '../finance-categories/category-rules.service';
import { assertOrganization } from '../shared/relations';
import { isFullIsoWeek } from '../shared/period';
import { resolveParty } from '../shared/parties';
import {
  parseBankRows,
  parsePurchaseRows,
  parseSalesRows,
  type ParsedImportPreview,
  type ParsedImportRow,
} from './finance-imports.parser';
import type {
  ListBatchesFilters,
  PreviewImportInput,
} from './finance-imports.schema';
import {
  serializeRows,
  deserializeRows,
  documentKindOf,
  stringOrNull,
  stringOrDefault,
  numberOrDefault,
  numberOrNull,
  dateOrNull,
  rawValue,
  type StoredPreviewRow,
} from './finance-imports.serde';
import { refs } from './finance-imports.shared';
import { assertBankAccount } from './bank-accounts.service';

type UploadFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export async function previewImport(input: PreviewImportInput, file?: UploadFile) {
  if (!file) throw badRequest('Debes adjuntar un archivo');
  await assertOrganization(input.organizationId);
  const bankAccountId = await assertBankAccount(input);
  const { periodStart, periodEnd } = input;
  const rows = readRows(file, input.type);
  const parsed = parseRows(input.type, rows, bankAccountId, input.organizationId);
  const dedupeKeys = await getExistingDedupeKeys(input.type, parsed.rows);
  const rowsWithDuplicates = parsed.rows.map((row) =>
    dedupeKeys.has(row.dedupeKey)
      ? { ...row, status: 'DUPLICATE' as const }
      : row,
  );
  const summary = summarizeRows({ ...parsed, rows: rowsWithDuplicates });
  const sourceHash = createHash('sha256').update(file.buffer).digest('hex');

  // Min/max real de las fechas de las filas (spec §3): para advertir si el
  // archivo no cuadra con el rango declarado. Las ERROR no cuentan.
  const { dataStart, dataEnd } = computeDataRange(rowsWithDuplicates);

  const batchWarnings = await buildBatchWarnings({
    organizationId: input.organizationId,
    periodStart,
    periodEnd,
    dataStart,
    dataEnd,
    sourceHash,
  });

  const batch = await prisma.financialImportBatch.create({
    data: {
      organizationId: input.organizationId,
      bankAccountId,
      type: input.type,
      status: FinancialImportStatus.PREVIEW,
      periodStart,
      periodEnd,
      dataStart,
      dataEnd,
      originalFileName: file.originalname,
      fileSize: file.size,
      sourceHash,
      rowsTotal: summary.rowsTotal,
      rowsValid: summary.rowsValid,
      rowsSkipped: summary.rowsSkipped,
      rowsDuplicated: summary.rowsDuplicated,
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      totalCharges: summary.totalCharges,
      totalCredits: summary.totalCredits,
      // Las advertencias de lote van delante de las de fila.
      warnings: [...batchWarnings, ...summary.warnings],
      previewData: serializeRows(rowsWithDuplicates),
    },
    include: refs,
  });

  const salesSummary =
    input.type === FinancialImportType.SALES_REPORT
      ? await buildSalesSummary(input.organizationId, parsed, rowsWithDuplicates)
      : null;

  return { batch, rows: rowsWithDuplicates, salesSummary, batchWarnings };
}

/// Fecha 'DD-MM-YYYY' de una fecha de calendario UTC, para mensajes legibles.
function fechaLegible(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getUTCFullYear()}`;
}

/// Min/max de las fechas de las filas (ingreso/gasto/movimiento), ignorando
/// las filas ERROR y las fechas nulas. Devuelve null si no hay ninguna fecha.
function computeDataRange(rows: ParsedImportRow[]): {
  dataStart: Date | null;
  dataEnd: Date | null;
} {
  let dataStart: Date | null = null;
  let dataEnd: Date | null = null;
  for (const row of rows) {
    if (row.status === 'ERROR') continue;
    const raw =
      row.data.incomeDate ?? row.data.expenseDate ?? row.data.transactionDate;
    if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) continue;
    if (!dataStart || raw < dataStart) dataStart = raw;
    if (!dataEnd || raw > dataEnd) dataEnd = raw;
  }
  return { dataStart, dataEnd };
}

/// Las tres advertencias de lote del preview (spec §3). NO son bloqueantes: el
/// CEO puede confirmar igual (hay motivos legítimos para cada caso).
async function buildBatchWarnings(args: {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  dataStart: Date | null;
  dataEnd: Date | null;
  sourceHash: string;
}): Promise<string[]> {
  const { periodStart, periodEnd, dataStart, dataEnd, sourceHash } = args;
  const warnings: string[] = [];

  // (a) Filas fuera del rango declarado.
  if (
    (dataStart && dataStart < periodStart) ||
    (dataEnd && dataEnd > periodEnd)
  ) {
    warnings.push(
      `Declaraste del ${fechaLegible(periodStart)} al ${fechaLegible(periodEnd)}, ` +
        `pero el archivo trae filas fuera de ese rango ` +
        `(del ${fechaLegible(dataStart ?? periodStart)} al ${fechaLegible(dataEnd ?? periodEnd)}).`,
    );
  }

  // (b) Mismo archivo ya importado y confirmado. sourceHash se guardaba y jamás
  //     se consultaba; aquí gana su primer consumidor.
  const yaImportado = await prisma.financialImportBatch.findFirst({
    where: {
      organizationId: args.organizationId,
      sourceHash,
      status: FinancialImportStatus.CONFIRMED,
    },
    select: { confirmedAt: true },
  });
  if (yaImportado) {
    const cuando = yaImportado.confirmedAt
      ? ` el ${fechaLegible(yaImportado.confirmedAt)}`
      : '';
    warnings.push(`Este archivo ya se importó${cuando}.`);
  }

  // (c) El rango declarado no es una semana ISO completa (lun–dom). Solo tiene
  //     sentido avisar cuando el rango PARECE un intento de semana (≤ 8 días
  //     inclusive): en una carga mensual —parcial o completa— este aviso sería
  //     ruido, no un error, porque el CEO nunca pretendió declarar una semana.
  const DIA_MS = 86_400_000;
  const pareceSemana = periodEnd.getTime() - periodStart.getTime() <= 7 * DIA_MS;
  if (pareceSemana && !isFullIsoWeek(periodStart, periodEnd)) {
    warnings.push('El rango no cubre una semana completa (lunes a domingo).');
  }

  return warnings;
}

/// Resumen específico de ventas: separa bruto facturado, notas de crédito y
/// neto, y cuántos clientes (por RUT) se crearían vs. ya existen.
async function buildSalesSummary(
  organizationId: string,
  parsed: ParsedImportPreview,
  rows: ParsedImportRow[],
) {
  const ruts = new Set<string>();
  for (const row of rows) {
    if (row.status === 'ERROR') continue;
    const rut = typeof row.data.sourceRut === 'string' ? row.data.sourceRut : '';
    if (rut) ruts.add(rut);
  }

  const existing = await prisma.client.findMany({
    where: { organizationId, rut: { in: [...ruts] } },
    select: { rut: true },
  });
  const existingRuts = new Set(existing.map((c) => c.rut));
  const clientsExisting = existingRuts.size;
  const clientsNew = [...ruts].filter((rut) => !existingRuts.has(rut)).length;

  return {
    totalGross: parsed.totalGross,
    totalCreditNotes: parsed.totalCreditNotes,
    totalNet: parsed.totalIncome,
    clientsNew,
    clientsExisting,
  };
}

export async function confirmImport(batchId: string) {
  const batch = await prisma.financialImportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) throw notFound('Lote de importación no encontrado');
  if (batch.status === FinancialImportStatus.FAILED) {
    throw badRequest(
      'Este lote quedó obsoleto por una actualización del sistema; vuelve a subir el archivo',
    );
  }
  if (batch.status !== FinancialImportStatus.PREVIEW) {
    throw badRequest('El lote ya fue confirmado o no está disponible');
  }

  const rows = deserializeRows(batch.previewData);
  const candidateRows = rows.filter(
    (row) => row.status === 'VALID' || row.status === 'WARNING',
  );

  const rules = await getActiveRules();

  const result = await prisma.$transaction(async (tx) => {
    // Re-chequeo de duplicados DENTRO de la transacción: entre el preview y esta
    // confirmación puede haberse confirmado otro lote solapado (p. ej. cargar el
    // mes parcial y luego el mes completo). Aquí `tx` ya ve esas filas, así que
    // las claves repetidas se SALTAN en vez de reventar el lote entero. Cierra la
    // ventana preview→confirm y hace idempotente la carga incremental.
    const alreadyPresent = await getExistingDedupeKeys(batch.type, candidateRows, tx);
    const rowsToInsert = candidateRows.filter(
      (row) => !alreadyPresent.has(row.dedupeKey),
    );

    let inserted = 0;
    let duplicated =
      rows.filter((row) => row.status === 'DUPLICATE').length +
      (candidateRows.length - rowsToInsert.length);

    for (const row of rowsToInsert) {
      const created = await createRow(tx, batch, row, rules);
      if (created) inserted += 1;
      else duplicated += 1;
    }

    let linkWarnings: string[] = [];
    if (batch.type === FinancialImportType.SALES_REPORT) {
      linkWarnings = await linkCreditNotes(tx, batch.id, batch.organizationId);
    }

    const updated = await tx.financialImportBatch.update({
      where: { id: batch.id },
      data: {
        status: FinancialImportStatus.CONFIRMED,
        confirmedAt: new Date(),
        rowsDuplicated: duplicated,
        rowsValid: inserted,
        warnings: (() => {
          const prev = Array.isArray(batch.warnings) ? batch.warnings : [];
          const merged = [...prev, ...linkWarnings];
          return merged as Prisma.InputJsonValue;
        })(),
      },
      include: refs,
    });

    return { batch: updated, inserted, duplicated };
  });

  return result;
}

export async function listBatches(filters: ListBatchesFilters) {
  return prisma.financialImportBatch.findMany({
    where: {
      organizationId: filters.organizationId,
      bankAccountId: filters.bankAccountId,
      type: filters.type,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: refs,
  });
}

export async function getBatch(id: string) {
  const batch = await prisma.financialImportBatch.findUnique({
    where: { id },
    include: refs,
  });
  if (!batch) throw notFound('Lote de importación no encontrado');
  return { ...batch, rows: deserializeRows(batch.previewData) };
}

function readRows(file: UploadFile, type: FinancialImportType) {
  const workbook = XLSX.read(file.buffer, {
    type: 'buffer',
    cellDates: true,
    raw: true,
  });
  const sheetName =
    type === FinancialImportType.BANK_STATEMENT
      ? workbook.SheetNames[0]
      : workbook.SheetNames.find((name) => name.toUpperCase() === 'DETALLE');
  if (!sheetName) throw badRequest('El archivo no contiene la hoja DETALLE');

  const sheet = workbook.Sheets[sheetName];
  if (type === FinancialImportType.BANK_STATEMENT) {
    return readBankRows(sheet);
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });
}

function readBankRows(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => String(cell).trim().toUpperCase() === 'FECHA') &&
    row.some((cell) => String(cell).toUpperCase().includes('SALDO')),
  );
  if (headerIndex === -1) {
    throw badRequest('La cartola no contiene encabezados reconocibles');
  }

  const headers = matrix[headerIndex].map((cell) => String(cell).trim());
  return matrix
    .slice(headerIndex + 1)
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row[index] ?? '';
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => String(value).trim()));
}

function parseRows(
  type: FinancialImportType,
  rows: Record<string, unknown>[],
  bankAccountId: string | null,
  organizationId: string,
) {
  if (type === FinancialImportType.SALES_REPORT) {
    return parseSalesRows(rows, organizationId);
  }
  if (type === FinancialImportType.PURCHASE_REPORT) {
    return parsePurchaseRows(rows, organizationId);
  }
  if (!bankAccountId) {
    throw badRequest('Debes seleccionar una cuenta bancaria para la cartola');
  }
  return parseBankRows(rows, bankAccountId);
}

/// Claves de deduplicación ya presentes en la BD, de entre las de `rows`.
/// Acepta un cliente transaccional para poder consultarse tanto en el preview
/// (contra `prisma`) como dentro de la transacción de confirmación (contra `tx`),
/// donde ve los lotes solapados ya confirmados.
async function getExistingDedupeKeys(
  type: FinancialImportType,
  rows: { dedupeKey: string }[],
  client: Prisma.TransactionClient = prisma,
) {
  const dedupeKeys = rows.map((row) => row.dedupeKey);
  if (dedupeKeys.length === 0) return new Set<string>();

  if (type === FinancialImportType.SALES_REPORT) {
    const existing = await client.incomeRecord.findMany({
      where: { sourceDedupeKey: { in: dedupeKeys } },
      select: { sourceDedupeKey: true },
    });
    return new Set(existing.flatMap((row) => row.sourceDedupeKey ?? []));
  }

  if (type === FinancialImportType.PURCHASE_REPORT) {
    const existing = await client.expenseRecord.findMany({
      where: { sourceDedupeKey: { in: dedupeKeys } },
      select: { sourceDedupeKey: true },
    });
    return new Set(existing.flatMap((row) => row.sourceDedupeKey ?? []));
  }

  const existing = await client.bankTransaction.findMany({
    where: { dedupeKey: { in: dedupeKeys } },
    select: { dedupeKey: true },
  });
  return new Set(existing.map((row) => row.dedupeKey));
}

function summarizeRows(preview: ParsedImportPreview) {
  const rowsDuplicated = preview.rows.filter(
    (row) => row.status === 'DUPLICATE',
  ).length;
  const rowsValid = preview.rows.filter(
    (row) => row.status === 'VALID' || row.status === 'WARNING',
  ).length;

  return {
    rowsTotal: preview.rows.length,
    rowsValid,
    rowsSkipped: preview.rows.filter((row) => row.status === 'ERROR').length,
    rowsDuplicated,
    totalIncome: preview.totalIncome,
    totalExpense: preview.totalExpense,
    totalCharges: preview.totalCharges,
    totalCredits: preview.totalCredits,
    warnings: preview.warnings,
  };
}

async function createRow(
  tx: Prisma.TransactionClient,
  batch: {
    id: string;
    organizationId: string;
    bankAccountId: string | null;
    type: FinancialImportType;
  },
  row: StoredPreviewRow,
  rules: { categoryKey: string; matchText: string; direction: 'CHARGE' | 'CREDIT' | 'ANY' }[],
) {
  try {
    if (batch.type === FinancialImportType.SALES_REPORT) {
      const clientName = stringOrNull(row.data.clientName);
      const rut = stringOrNull(row.data.sourceRut);
      const clientId = rut
        ? await resolveParty(
            { model: 'client', organizationId: batch.organizationId, rut, name: clientName },
            tx,
          )
        : null;
      const kind = documentKindOf(row.data.documentKind);
      await tx.incomeRecord.create({
        data: {
          organizationId: batch.organizationId,
          importBatchId: batch.id,
          clientId,
          documentKind: kind,
          // Factura/ND nace con neto = monto; la NC no tiene neto propio.
          netAmount:
            kind === DocumentKind.CREDIT_NOTE
              ? null
              : numberOrDefault(row.data.amount),
          paidDate: null,
          clientName,
          description: stringOrDefault(row.data.description, 'Ingreso importado'),
          amount: numberOrDefault(row.data.amount),
          currency: stringOrDefault(row.data.currency, 'CLP'),
          category: stringOrNull(row.data.category),
          status: stringOrDefault(row.data.status, 'INVOICED') as never,
          incomeDate: dateOrNull(row.data.incomeDate),
          dueDate: dateOrNull(row.data.dueDate),
          sourceDocumentType: stringOrNull(row.data.sourceDocumentType),
          sourceFolio: stringOrNull(row.data.sourceFolio),
          sourceRut: rut,
          sourceIssueDate: dateOrNull(row.data.sourceIssueDate),
          sourceDedupeKey: row.dedupeKey,
          rawData: row.rawData,
        },
      });
      return true;
    }

    if (batch.type === FinancialImportType.PURCHASE_REPORT) {
      const vendorName = stringOrNull(row.data.vendorName);
      const rut = stringOrNull(row.data.sourceRut);
      const vendorId = rut
        ? await resolveParty(
            { model: 'vendor', organizationId: batch.organizationId, rut, name: vendorName },
            tx,
          )
        : null;
      await tx.expenseRecord.create({
        data: {
          organizationId: batch.organizationId,
          importBatchId: batch.id,
          vendorId,
          vendorName,
          description: stringOrDefault(row.data.description, 'Gasto importado'),
          amount: numberOrDefault(row.data.amount),
          currency: stringOrDefault(row.data.currency, 'CLP'),
          category: stringOrNull(row.data.category),
          status: stringOrDefault(row.data.status, 'PENDING') as never,
          expenseDate: dateOrNull(row.data.expenseDate),
          dueDate: dateOrNull(row.data.dueDate),
          sourceDocumentType: stringOrNull(row.data.sourceDocumentType),
          sourceFolio: stringOrNull(row.data.sourceFolio),
          sourceRut: rut,
          sourceIssueDate: dateOrNull(row.data.sourceIssueDate),
          sourceDedupeKey: row.dedupeKey,
          rawData: row.rawData,
        },
      });
      return true;
    }

    if (!batch.bankAccountId) return false;
    await tx.bankTransaction.create({
      data: {
        organizationId: batch.organizationId,
        bankAccountId: batch.bankAccountId,
        importBatchId: batch.id,
        transactionDate: dateOrNull(row.data.transactionDate) ?? new Date(),
        description: stringOrDefault(row.data.description, 'Movimiento importado'),
        channel: stringOrNull(row.data.channel),
        documentNumber: stringOrNull(row.data.documentNumber),
        chargeAmount: numberOrDefault(row.data.chargeAmount),
        creditAmount: numberOrDefault(row.data.creditAmount),
        category: categorizeWith(
          rules,
          stringOrDefault(row.data.description, 'Movimiento importado'),
          numberOrDefault(row.data.chargeAmount) > 0,
        ),
        balance: numberOrNull(row.data.balance),
        currency: stringOrDefault(row.data.currency, 'CLP'),
        dedupeKey: row.dedupeKey,
        rawData: row.rawData,
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // Salvavidas de último recurso. Los duplicados contra la BD ya se saltan
      // en confirmImport (re-chequeo dentro de la transacción), así que aquí solo
      // se cae por una carrera real: otro lote solapado que se confirmó entre ese
      // re-chequeo y este insert. No se puede "saltar" la fila —en Postgres la
      // sentencia fallida ya abortó la transacción (25P02)—; el rollback atómico
      // del lote es lo correcto, con un mensaje legible en vez del código críptico.
      throw badRequest(`Fila duplicada en el lote: ${row.dedupeKey}`);
    }
    throw error;
  }
}


/// Segunda pasada: vincula cada nota de crédito del lote con la factura que
/// anula (por `NRO DOCUMENTO ANULADO`) y recalcula su neto. Devuelve
/// advertencias para folios ambiguos o sin factura encontrada.
async function linkCreditNotes(
  tx: Prisma.TransactionClient,
  batchId: string,
  organizationId: string,
): Promise<string[]> {
  const warnings: string[] = [];
  // `creditsIncomeId: null` hace el vínculo idempotente: nunca re-resta una NC
  // que ya fue vinculada (defensa ante reprocesos).
  const creditNotes = await tx.incomeRecord.findMany({
    where: {
      importBatchId: batchId,
      documentKind: DocumentKind.CREDIT_NOTE,
      creditsIncomeId: null,
    },
    select: { id: true, amount: true, sourceFolio: true, rawData: true },
  });

  for (const nc of creditNotes) {
    const folio = rawValue(nc.rawData, 'NRO DOCUMENTO ANULADO');
    if (!folio) {
      warnings.push(`NC ${nc.sourceFolio ?? ''}: sin folio de documento anulado`);
      continue;
    }

    const candidates = await tx.incomeRecord.findMany({
      where: {
        organizationId,
        sourceFolio: folio,
        documentKind: { in: [DocumentKind.SALE, DocumentKind.DEBIT_NOTE] },
      },
      orderBy: { incomeDate: 'desc' },
      select: { id: true, amount: true, netAmount: true },
    });

    if (candidates.length === 0) {
      warnings.push(`NC ${nc.sourceFolio ?? ''}: factura ${folio} no encontrada`);
      continue;
    }
    if (candidates.length > 1) {
      warnings.push(
        `NC ${nc.sourceFolio ?? ''}: varias facturas con folio ${folio}, se usó la más reciente`,
      );
    }

    const factura = candidates[0];
    await tx.incomeRecord.update({
      where: { id: nc.id },
      data: { creditsIncomeId: factura.id },
    });
    // netAmount de la factura = su neto actual + monto (negativo) de la NC.
    const base = factura.netAmount ?? factura.amount;
    await tx.incomeRecord.update({
      where: { id: factura.id },
      data: { netAmount: base + nc.amount },
    });
  }

  return warnings;
}
