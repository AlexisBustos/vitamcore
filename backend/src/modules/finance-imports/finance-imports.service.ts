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

export { listBankAccounts, createBankAccount, updateBankAccount } from './bank-accounts.service';
export {
  listBankTransactions,
  listBankTransactionMonths,
  listBankMonthly,
  listBankByCategory,
  setCategoryBulk,
  setTransactionCategory,
} from './bank-transactions.service';

type UploadFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export async function previewImport(input: PreviewImportInput, file?: UploadFile) {
  if (!file) throw badRequest('Debes adjuntar un archivo');
  await assertOrganization(input.organizationId);
  const bankAccountId = await assertBankAccount(input);
  const periodMonth = normalizePeriodMonth(input.periodMonth);
  const rows = readRows(file, input.type);
  const parsed = parseRows(input.type, rows, bankAccountId);
  const dedupeKeys = await getExistingDedupeKeys(input.type, parsed.rows);
  const rowsWithDuplicates = parsed.rows.map((row) =>
    dedupeKeys.has(row.dedupeKey)
      ? { ...row, status: 'DUPLICATE' as const }
      : row,
  );
  const summary = summarizeRows({ ...parsed, rows: rowsWithDuplicates });
  const sourceHash = createHash('sha256').update(file.buffer).digest('hex');

  const batch = await prisma.financialImportBatch.create({
    data: {
      organizationId: input.organizationId,
      bankAccountId,
      type: input.type,
      status: FinancialImportStatus.PREVIEW,
      periodMonth,
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
      warnings: summary.warnings,
      previewData: serializeRows(rowsWithDuplicates),
    },
    include: refs,
  });

  const salesSummary =
    input.type === FinancialImportType.SALES_REPORT
      ? await buildSalesSummary(input.organizationId, parsed, rowsWithDuplicates)
      : null;

  return { batch, rows: rowsWithDuplicates, salesSummary };
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
  if (batch.status !== FinancialImportStatus.PREVIEW) {
    throw badRequest('El lote ya fue confirmado o no está disponible');
  }

  const rows = deserializeRows(batch.previewData);
  const rowsToInsert = rows.filter(
    (row) => row.status === 'VALID' || row.status === 'WARNING',
  );

  const rules = await getActiveRules();

  const result = await prisma.$transaction(async (tx) => {
    let inserted = 0;
    let duplicated = rows.filter((row) => row.status === 'DUPLICATE').length;

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
) {
  if (type === FinancialImportType.SALES_REPORT) return parseSalesRows(rows);
  if (type === FinancialImportType.PURCHASE_REPORT) return parsePurchaseRows(rows);
  if (!bankAccountId) {
    throw badRequest('Debes seleccionar una cuenta bancaria para la cartola');
  }
  return parseBankRows(rows, bankAccountId);
}

async function getExistingDedupeKeys(
  type: FinancialImportType,
  rows: ParsedImportRow[],
) {
  const dedupeKeys = rows.map((row) => row.dedupeKey);
  if (dedupeKeys.length === 0) return new Set<string>();

  if (type === FinancialImportType.SALES_REPORT) {
    const existing = await prisma.incomeRecord.findMany({
      where: { sourceDedupeKey: { in: dedupeKeys } },
      select: { sourceDedupeKey: true },
    });
    return new Set(existing.flatMap((row) => row.sourceDedupeKey ?? []));
  }

  if (type === FinancialImportType.PURCHASE_REPORT) {
    const existing = await prisma.expenseRecord.findMany({
      where: { sourceDedupeKey: { in: dedupeKeys } },
      select: { sourceDedupeKey: true },
    });
    return new Set(existing.flatMap((row) => row.sourceDedupeKey ?? []));
  }

  const existing = await prisma.bankTransaction.findMany({
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
      return false;
    }
    throw error;
  }
}

function normalizePeriodMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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

export async function listReconciliationCandidates(filters: {
  recordType: 'income' | 'expense';
  recordId: string;
  search?: string;
}) {
  let organizationId: string;
  let target: number;
  let refDate: Date | null;
  const direction = filters.recordType === 'income' ? 'credit' : 'charge';

  if (filters.recordType === 'income') {
    const rec = await prisma.incomeRecord.findUnique({
      where: { id: filters.recordId },
      select: { organizationId: true, amount: true, netAmount: true, incomeDate: true, dueDate: true },
    });
    if (!rec) throw notFound('Ingreso no encontrado');
    organizationId = rec.organizationId;
    target = rec.netAmount ?? rec.amount;
    refDate = rec.incomeDate ?? rec.dueDate ?? null;
  } else {
    const rec = await prisma.expenseRecord.findUnique({
      where: { id: filters.recordId },
      select: { organizationId: true, amount: true, expenseDate: true, dueDate: true },
    });
    if (!rec) throw notFound('Gasto no encontrado');
    organizationId = rec.organizationId;
    target = rec.amount;
    refDate = rec.expenseDate ?? rec.dueDate ?? null;
  }

  const searchWhere: Prisma.BankTransactionWhereInput = filters.search
    ? { description: { contains: filters.search, mode: 'insensitive' } }
    : {};

  const dirWhere: Prisma.BankTransactionWhereInput =
    direction === 'credit'
      ? { ...searchWhere, organizationId, creditAmount: { gt: 0 } }
      : { ...searchWhere, organizationId, chargeAmount: { gt: 0 } };
  const exactWhere: Prisma.BankTransactionWhereInput =
    direction === 'credit'
      ? { ...searchWhere, organizationId, creditAmount: target }
      : { ...searchWhere, organizationId, chargeAmount: target };

  const [exactRows, recentRows] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: exactWhere,
      orderBy: { transactionDate: 'desc' },
      take: 50,
    }),
    prisma.bankTransaction.findMany({
      where: dirWhere,
      orderBy: { transactionDate: 'desc' },
      take: 100,
    }),
  ]);

  const byId = new Map<string, (typeof recentRows)[number]>();
  for (const t of [...exactRows, ...recentRows]) byId.set(t.id, t);

  const refTime = refDate ? refDate.getTime() : null;
  const ranked = [...byId.values()]
    .map((t) => {
      const amount = direction === 'credit' ? t.creditAmount : t.chargeAmount;
      return {
        id: t.id,
        transactionDate: t.transactionDate,
        description: t.description,
        amount,
        exact: amount === target,
        dist: refTime ? Math.abs(t.transactionDate.getTime() - refTime) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => (a.exact !== b.exact ? (a.exact ? -1 : 1) : a.dist - b.dist));

  const limit = filters.search ? 20 : 8;
  return ranked.slice(0, limit).map(({ dist: _dist, ...c }) => c);
}
