export type ImportRowStatus = 'VALID' | 'WARNING' | 'DUPLICATE' | 'ERROR';

export interface ParsedImportRow {
  status: ImportRowStatus;
  dedupeKey: string;
  warnings: string[];
  data: Record<string, unknown>;
  rawData: Record<string, unknown>;
}

export interface ParsedImportPreview {
  rows: ParsedImportRow[];
  rowsTotal: number;
  rowsValid: number;
  rowsSkipped: number;
  totalIncome: number;
  totalExpense: number;
  totalCharges: number;
  totalCredits: number;
  warnings: string[];
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function upper(value: unknown): string {
  return text(value).toUpperCase();
}

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [upper(key), value]),
  );
  for (const key of keys) {
    const value = normalized.get(upper(key));
    if (value !== undefined && value !== null && text(value) !== '') {
      return value;
    }
  }
  return undefined;
}

function isoDate(date: Date | null): string {
  return date?.toISOString().slice(0, 10) ?? '';
}

function parsePaid(value: unknown) {
  return upper(value) === 'SI';
}

function buildPreview(
  rows: ParsedImportRow[],
  totals: Partial<
    Pick<
      ParsedImportPreview,
      'totalIncome' | 'totalExpense' | 'totalCharges' | 'totalCredits'
    >
  > = {},
): ParsedImportPreview {
  return {
    rows,
    rowsTotal: rows.length,
    rowsValid: rows.filter((row) => row.status === 'VALID').length,
    rowsSkipped: rows.filter((row) => row.status === 'ERROR').length,
    totalIncome: totals.totalIncome ?? 0,
    totalExpense: totals.totalExpense ?? 0,
    totalCharges: totals.totalCharges ?? 0,
    totalCredits: totals.totalCredits ?? 0,
    warnings: rows.flatMap((row) => row.warnings),
  };
}

export function normalizeMoney(value: unknown): number {
  if (typeof value === 'number') return Math.round(value);

  const raw = text(value).replace(/\$/g, '').replace(/\s/g, '');
  if (!raw) return 0;

  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function normalizeRut(value: unknown): string {
  return text(value).replace(/\./g, '').toUpperCase();
}

export function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = text(value);
  if (!raw) return null;

  const dateOnly = raw.split(/\s+/)[0];
  const parts = dateOnly.split(/[-/]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const [first, second, third] = parts;
  if (first > 1900) return new Date(Date.UTC(first, second - 1, third));
  return new Date(Date.UTC(third, second - 1, first));
}

export function parseSalesRows(
  rows: Record<string, unknown>[],
): ParsedImportPreview {
  const parsedRows = rows.map((row) => {
      const documentType = text(valueOf(row, 'DOCUMENTO'));
      const folio = text(valueOf(row, 'FOLIO'));
      const rut = normalizeRut(valueOf(row, 'RUT'));
      const issueDate = normalizeDate(valueOf(row, 'FECHA'));
      const dueDate = normalizeDate(valueOf(row, 'FECHA VENCIMIENTO DOCUMENTO'));
      const amount = normalizeMoney(valueOf(row, 'TOTAL'));
      const warnings = [
        ...(!issueDate ? ['Fila de venta sin fecha'] : []),
        ...(!folio ? ['Fila de venta sin folio'] : []),
        ...(!rut ? ['Fila de venta sin RUT'] : []),
      ];

      return {
        status: warnings.length > 0 ? 'WARNING' : 'VALID',
        dedupeKey: [
          'SALES_REPORT',
          documentType,
          folio,
          rut,
          isoDate(issueDate),
          amount,
        ].join('|'),
        warnings,
        data: {
          clientName: text(valueOf(row, 'RAZON SOCIAL')),
          description: `${documentType} ${folio}`.trim(),
          amount,
          currency: text(valueOf(row, 'TIPO DE MONEDA')) || 'CLP',
          category: 'Ventas',
          status: parsePaid(valueOf(row, 'PAGADO')) ? 'PAID' : 'INVOICED',
          incomeDate: issueDate,
          dueDate: dueDate ?? issueDate,
          sourceDocumentType: documentType,
          sourceFolio: folio,
          sourceRut: rut,
          sourceIssueDate: issueDate,
        },
        rawData: row,
      } satisfies ParsedImportRow;
    });

  return buildPreview(parsedRows, {
    totalIncome: parsedRows.reduce(
      (sum, row) => sum + (Number(row.data.amount) || 0),
      0,
    ),
  });
}

export function parsePurchaseRows(
  rows: Record<string, unknown>[],
): ParsedImportPreview {
  const parsedRows = rows.map((row) => {
    const documentType = text(valueOf(row, 'DOCUMENTO'));
    const folio = text(valueOf(row, 'FOLIO'));
    const rut = normalizeRut(valueOf(row, 'RUT'));
    const issueDate = normalizeDate(valueOf(row, 'FECHA DOCUMENTO'));
    const dueDate = normalizeDate(valueOf(row, 'FECHA VENCIMIENTO'));
    const amount = normalizeMoney(valueOf(row, 'TOTAL'));
    const warnings = [
      ...(!issueDate ? ['Fila de compra sin fecha'] : []),
      ...(!folio ? ['Fila de compra sin folio'] : []),
      ...(!rut ? ['Fila de compra sin RUT'] : []),
    ];

    return {
      status: warnings.length > 0 ? 'WARNING' : 'VALID',
      dedupeKey: [
        'PURCHASE_REPORT',
        documentType,
        folio,
        rut,
        isoDate(issueDate),
        amount,
      ].join('|'),
      warnings,
      data: {
        vendorName: text(valueOf(row, 'RAZON SOCIAL')),
        description: `${documentType} ${folio}`.trim(),
        amount,
        expenseAmount: amount,
        currency: 'CLP',
        category: 'Compras',
        status: parsePaid(valueOf(row, 'PAGADO')) ? 'PAID' : 'PENDING',
        expenseDate: issueDate,
        dueDate,
        sourceDocumentType: documentType,
        sourceFolio: folio,
        sourceRut: rut,
        sourceIssueDate: issueDate,
      },
      rawData: row,
    } satisfies ParsedImportRow;
  });

  return buildPreview(parsedRows, {
    totalExpense: parsedRows.reduce(
      (sum, row) => sum + (Number(row.data.amount) || 0),
      0,
    ),
  });
}

export function parseBankRows(
  rows: Record<string, unknown>[],
  bankAccountId: string,
): ParsedImportPreview {
  const parsedRows = rows.map((row) => {
      const transactionDate = normalizeDate(
        valueOf(row, 'Fecha', 'Fecha Contable', 'Fecha Movimiento'),
      );
      const description = text(
        valueOf(row, 'Descripcion', 'Descripción', 'Glosa'),
      );
      const documentNumber = text(
        valueOf(
          row,
          'Documento',
          'Numero Documento',
          'Número Documento',
          'Nro. Docto.',
        ),
      );
      const chargeAmount = normalizeMoney(
        valueOf(row, 'Cargos (CLP)', 'Cargo', 'Cargos'),
      );
      const creditAmount = normalizeMoney(
        valueOf(row, 'Abonos (CLP)', 'Abono', 'Abonos'),
      );
      const balance = normalizeMoney(valueOf(row, 'Saldo (CLP)', 'Saldo'));
      const warnings = [
        ...(!transactionDate ? ['Movimiento sin fecha'] : []),
        ...(!description ? ['Movimiento sin descripción'] : []),
      ];

      return {
        status: warnings.length > 0 ? 'WARNING' : 'VALID',
        dedupeKey: [
          bankAccountId,
          isoDate(transactionDate),
          documentNumber,
          description,
          chargeAmount,
          creditAmount,
          balance,
        ].join('|'),
        warnings,
        data: {
          transactionDate,
          description,
          channel: text(valueOf(row, 'Canal o Sucursal', 'Canal', 'Sucursal')),
          documentNumber,
          chargeAmount,
          creditAmount,
          balance,
          currency: 'CLP',
        },
        rawData: row,
      } satisfies ParsedImportRow;
    });

  return buildPreview(parsedRows, {
    totalCharges: parsedRows.reduce(
      (sum, row) => sum + (Number(row.data.chargeAmount) || 0),
      0,
    ),
    totalCredits: parsedRows.reduce(
      (sum, row) => sum + (Number(row.data.creditAmount) || 0),
      0,
    ),
  });
}
