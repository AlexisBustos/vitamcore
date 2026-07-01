import { Prisma, DocumentKind } from '@prisma/client';
import type { ParsedImportRow } from './finance-imports.parser';

export type StoredPreviewRow = Omit<ParsedImportRow, 'data' | 'rawData'> & {
  data: Record<string, Prisma.JsonValue>;
  rawData: Record<string, Prisma.JsonValue>;
};

export function serializeRows(rows: ParsedImportRow[]): Prisma.InputJsonValue {
  return rows.map((row) => ({
    ...row,
    data: serializeRecord(row.data),
    rawData: serializeRecord(row.rawData),
  }));
}

export function serializeRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : toJsonValue(value),
    ]),
  );
}

export function toJsonValue(value: unknown): Prisma.JsonValue {
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

export function deserializeRows(value: Prisma.JsonValue | null): StoredPreviewRow[] {
  if (!Array.isArray(value)) return [];
  return value as StoredPreviewRow[];
}

export function documentKindOf(value: Prisma.JsonValue | undefined): DocumentKind {
  if (value === 'CREDIT_NOTE') return DocumentKind.CREDIT_NOTE;
  if (value === 'DEBIT_NOTE') return DocumentKind.DEBIT_NOTE;
  return DocumentKind.SALE;
}

export function stringOrNull(value: Prisma.JsonValue | undefined) {
  const str = typeof value === 'string' ? value.trim() : '';
  return str || null;
}

export function stringOrDefault(value: Prisma.JsonValue | undefined, fallback: string) {
  return stringOrNull(value) ?? fallback;
}

export function numberOrDefault(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function numberOrNull(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function dateOrNull(value: Prisma.JsonValue | undefined) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/// Lee una clave de un objeto rawData ignorando mayúsculas y espacios extremos.
export function rawValue(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const target = key.trim().toUpperCase();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.trim().toUpperCase() === target) {
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s : null;
    }
  }
  return null;
}
