import { addMonths } from '../shared/dates';

export type ImportRowStatus = 'VALID' | 'WARNING' | 'DUPLICATE' | 'ERROR';

export interface ParsedImportRow {
  status: ImportRowStatus;
  dedupeKey: string;
  warnings: string[];
  data: Record<string, unknown>;
  rawData: Record<string, unknown>;
}

export type DocumentKind = 'SALE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export interface ParsedImportPreview {
  rows: ParsedImportRow[];
  rowsTotal: number;
  rowsValid: number;
  rowsSkipped: number;
  totalIncome: number;
  totalExpense: number;
  totalCharges: number;
  totalCredits: number;
  /** Solo ventas: bruto facturado (facturas + notas de débito). */
  totalGross: number;
  /** Solo ventas: total de notas de crédito en valor absoluto. */
  totalCreditNotes: number;
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

function buildPreview(
  rows: ParsedImportRow[],
  totals: Partial<
    Pick<
      ParsedImportPreview,
      | 'totalIncome'
      | 'totalExpense'
      | 'totalCharges'
      | 'totalCredits'
      | 'totalGross'
      | 'totalCreditNotes'
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
    totalGross: totals.totalGross ?? 0,
    totalCreditNotes: totals.totalCreditNotes ?? 0,
    warnings: rows.flatMap((row) => row.warnings),
  };
}

/// Clasifica un documento de venta por su descripción tributaria.
/// Las notas de crédito restan; facturas, boletas y notas de débito suman.
export function classifyDocumentKind(documentType: string): DocumentKind {
  const t = upper(documentType);
  if (t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO')) {
    return 'CREDIT_NOTE';
  }
  if (t.includes('NOTA DE DEBITO') || t.includes('NOTA DE DÉBITO')) {
    return 'DEBIT_NOTE';
  }
  return 'SALE';
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
  organizationId: string,
): ParsedImportPreview {
  const parsedRows = rows.map((row) => {
      const documentType = text(valueOf(row, 'DOCUMENTO'));
      const folio = text(valueOf(row, 'FOLIO'));
      const rut = normalizeRut(valueOf(row, 'RUT'));
      const issueDate = normalizeDate(valueOf(row, 'FECHA'));
      const amount = normalizeMoney(valueOf(row, 'TOTAL'));
      const documentKind = classifyDocumentKind(documentType);
      const emitido = upper(text(valueOf(row, 'EMITIDO'))) === 'SI';
      const warnings = [
        ...(!emitido ? ['Documento no emitido'] : []),
        ...(!issueDate ? ['Fila de venta sin fecha'] : []),
        ...(!folio ? ['Fila de venta sin folio'] : []),
        ...(!rut ? ['Fila de venta sin RUT'] : []),
      ];
      const status = !emitido
        ? ('ERROR' as const)
        : warnings.length > 0
        ? ('WARNING' as const)
        : ('VALID' as const);

      return {
        status,
        dedupeKey: [
          organizationId,
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
          category:
            documentKind === 'CREDIT_NOTE' ? 'Notas de crédito' : 'Ventas',
          documentKind,
          // Emisión: por cobrar; el libro NO declara cobranza, no se adivina pago.
          status: 'INVOICED',
          incomeDate: issueDate,
          // Vencimiento fijo a 1 mes desde la emisión (el libro lo trae vacío).
          dueDate: issueDate ? addMonths(issueDate, 1) : null,
          sourceDocumentType: documentType,
          sourceFolio: folio,
          sourceRut: rut,
          sourceIssueDate: issueDate,
        },
        rawData: row,
      } satisfies ParsedImportRow;
    });

  const totalIncome = parsedRows.reduce(
    (sum, row) => sum + (Number(row.data.amount) || 0),
    0,
  );
  const totalCreditNotes = parsedRows.reduce(
    (sum, row) =>
      row.data.documentKind === 'CREDIT_NOTE'
        ? sum + Math.abs(Number(row.data.amount) || 0)
        : sum,
    0,
  );
  // Bruto facturado = neto + notas de crédito (las NC vienen con signo negativo).
  const totalGross = totalIncome + totalCreditNotes;

  return buildPreview(parsedRows, {
    totalIncome,
    totalGross,
    totalCreditNotes,
  });
}

export function parsePurchaseRows(
  rows: Record<string, unknown>[],
  organizationId: string,
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
        organizationId,
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
        // El libro de compras no declara pago: el cobro se registra a mano.
        status: 'PENDING',
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
