import { createHash } from 'node:crypto';
import { FinancialImportStatus, FinancialImportType, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertOrganization } from '../shared/relations';
import {
  parseBankRows,
  parsePurchaseRows,
  parseSalesRows,
  type ParsedImportPreview,
  type ParsedImportRow,
} from './finance-imports.parser';
import type {
  CreateBankAccountInput,
  ListBatchesFilters,
  UpdateBankAccountInput,
  PreviewImportInput,
} from './finance-imports.schema';

type UploadFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

type StoredPreviewRow = Omit<ParsedImportRow, 'data' | 'rawData'> & {
  data: Record<string, Prisma.JsonValue>;
  rawData: Record<string, Prisma.JsonValue>;
};

const refs = {
  organization: { select: { id: true, name: true } },
  bankAccount: { select: { id: true, name: true, accountNumber: true } },
};

export async function listBankAccounts(filters: { organizationId?: string }) {
  return prisma.bankAccount.findMany({
    where: {
      organizationId: filters.organizationId,
      isActive: true,
    },
    orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
    include: { organization: { select: { id: true, name: true } } },
  });
}

export async function createBankAccount(input: CreateBankAccountInput) {
  await assertOrganization(input.organizationId);
  try {
    return await prisma.bankAccount.create({
      data: input,
      include: { organization: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw badRequest('Ya existe una cuenta con ese número para la empresa');
    }
    throw error;
  }
}

export async function updateBankAccount(
  id: string,
  input: UpdateBankAccountInput,
) {
  const current = await prisma.bankAccount.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) throw notFound('Cuenta bancaria no encontrada');
  try {
    return await prisma.bankAccount.update({
      where: { id },
      data: input,
      include: { organization: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw badRequest('Ya existe una cuenta con ese número para la empresa');
    }
    throw error;
  }
}

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

  return { batch, rows: rowsWithDuplicates };
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

  const result = await prisma.$transaction(async (tx) => {
    let inserted = 0;
    let duplicated = rows.filter((row) => row.status === 'DUPLICATE').length;

    for (const row of rowsToInsert) {
      const created = await createRow(tx, batch, row);
      if (created) inserted += 1;
      else duplicated += 1;
    }

    const updated = await tx.financialImportBatch.update({
      where: { id: batch.id },
      data: {
        status: FinancialImportStatus.CONFIRMED,
        confirmedAt: new Date(),
        rowsDuplicated: duplicated,
        rowsValid: inserted,
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

async function assertBankAccount(input: PreviewImportInput) {
  if (input.type !== FinancialImportType.BANK_STATEMENT) return null;
  if (!input.bankAccountId) {
    throw badRequest('Debes seleccionar una cuenta bancaria para la cartola');
  }

  const account = await prisma.bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { id: true, organizationId: true },
  });
  if (!account) throw notFound('Cuenta bancaria no encontrada');
  if (account.organizationId !== input.organizationId) {
    throw badRequest('La cuenta bancaria no pertenece a la empresa indicada');
  }
  return account.id;
}

function readRows(file: UploadFile, type: FinancialImportType) {
  const workbook = XLSX.read(file.buffer, {
    type: 'buffer',
    cellDates: true,
    raw: false,
  });
  const sheetName =
    type === FinancialImportType.BANK_STATEMENT
      ? workbook.SheetNames[0]
      : workbook.SheetNames.find((name) => name.toUpperCase() === 'DETALLE');
  if (!sheetName) throw badRequest('El archivo no contiene la hoja DETALLE');

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
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

function serializeRows(rows: ParsedImportRow[]): Prisma.InputJsonValue {
  return rows.map((row) => ({
    ...row,
    data: serializeRecord(row.data),
    rawData: serializeRecord(row.rawData),
  }));
}

function serializeRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : toJsonValue(value),
    ]),
  );
}

function toJsonValue(value: unknown): Prisma.JsonValue {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return String(value);
}

function deserializeRows(value: Prisma.JsonValue | null): StoredPreviewRow[] {
  if (!Array.isArray(value)) return [];
  return value as StoredPreviewRow[];
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
) {
  try {
    if (batch.type === FinancialImportType.SALES_REPORT) {
      await tx.incomeRecord.create({
        data: {
          organizationId: batch.organizationId,
          importBatchId: batch.id,
          clientName: stringOrNull(row.data.clientName),
          description: stringOrDefault(row.data.description, 'Ingreso importado'),
          amount: numberOrDefault(row.data.amount),
          currency: stringOrDefault(row.data.currency, 'CLP'),
          category: stringOrNull(row.data.category),
          status: stringOrDefault(row.data.status, 'INVOICED') as never,
          incomeDate: dateOrNull(row.data.incomeDate),
          dueDate: dateOrNull(row.data.dueDate),
          sourceDocumentType: stringOrNull(row.data.sourceDocumentType),
          sourceFolio: stringOrNull(row.data.sourceFolio),
          sourceRut: stringOrNull(row.data.sourceRut),
          sourceIssueDate: dateOrNull(row.data.sourceIssueDate),
          sourceDedupeKey: row.dedupeKey,
          rawData: row.rawData,
        },
      });
      return true;
    }

    if (batch.type === FinancialImportType.PURCHASE_REPORT) {
      await tx.expenseRecord.create({
        data: {
          organizationId: batch.organizationId,
          importBatchId: batch.id,
          vendorName: stringOrNull(row.data.vendorName),
          description: stringOrDefault(row.data.description, 'Gasto importado'),
          amount: numberOrDefault(row.data.amount),
          currency: stringOrDefault(row.data.currency, 'CLP'),
          category: stringOrNull(row.data.category),
          status: stringOrDefault(row.data.status, 'PENDING') as never,
          expenseDate: dateOrNull(row.data.expenseDate),
          dueDate: dateOrNull(row.data.dueDate),
          sourceDocumentType: stringOrNull(row.data.sourceDocumentType),
          sourceFolio: stringOrNull(row.data.sourceFolio),
          sourceRut: stringOrNull(row.data.sourceRut),
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

function stringOrNull(value: Prisma.JsonValue | undefined) {
  const str = typeof value === 'string' ? value.trim() : '';
  return str || null;
}

function stringOrDefault(value: Prisma.JsonValue | undefined, fallback: string) {
  return stringOrNull(value) ?? fallback;
}

function numberOrDefault(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateOrNull(value: Prisma.JsonValue | undefined) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
