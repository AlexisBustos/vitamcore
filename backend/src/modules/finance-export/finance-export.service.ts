/**
 * Exportación de libros y reportes financieros a Excel (.xlsx).
 * Reutiliza los services de listado y de resumen (no duplica lógica de negocio):
 * respeta exactamente los mismos filtros que ven las vistas.
 */
import * as XLSX from 'xlsx';
import { list as listIncome } from '../income/income.service';
import { list as listExpenses } from '../expenses/expenses.service';
import { listBankTransactions } from '../finance-imports/bank-transactions.service';
import { getSummary, getConsolidated } from '../finance/finance-summary.service';
import { getTrend } from '../finance/finance-trend.service';
import type { ListIncomeFilters } from '../income/income.schema';
import type { ListExpenseFilters } from '../expenses/expenses.schema';
import type { ListTransactionsFilters } from '../finance-imports/finance-imports.schema';
import type { Granularity } from '../shared/period';

// ---------- Helpers ----------

const INCOME_STATUS: Record<string, string> = {
  EXPECTED: 'Esperado',
  INVOICED: 'Facturado',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
  CANCELLED: 'Anulado',
};
const EXPENSE_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
  CANCELLED: 'Anulado',
};

// Fechas del dominio = calendario a medianoche UTC; se leen en UTC (dd-mm-aaaa).
function fecha(d: Date | null | undefined): string {
  if (!d) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

function documento(tipo: string | null, folio: string | null): string {
  return [tipo?.trim(), folio?.trim()].filter(Boolean).join(' ');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Etiqueta legible de una clave de período: '2026-W28' → 'Semana 28 2026'; '2026-07' → 'jul 2026'. */
function etiquetaPeriodo(key: string): string {
  const semana = /^(\d{4})-W(\d{2})$/.exec(key);
  if (semana) return `Semana ${Number(semana[2])} ${semana[1]}`;
  const mes = /^(\d{4})-(\d{2})$/.exec(key);
  if (mes) return `${MESES[Number(mes[2]) - 1] ?? mes[2]} ${mes[1]}`;
  return key;
}

type Col<T> = { header: string; width?: number; get: (row: T) => string | number | null };

/** Hoja desde filas + columnas, con cabecera siempre presente (aunque no haya datos). */
function sheet<T>(rows: T[], cols: Col<T>[]): XLSX.WorkSheet {
  const aoa = [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => c.get(r) ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map((c) => ({ wch: c.width ?? Math.max(10, c.header.length + 2) }));
  return ws;
}

function workbook(sheets: { name: string; ws: XLSX.WorkSheet }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, s.ws, s.name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---------- Ingresos ----------

export async function exportIncome(filters: ListIncomeFilters): Promise<Buffer> {
  const rows = await listIncome(filters);
  const ws = sheet(rows, [
    { header: 'Fecha', get: (r) => fecha(r.incomeDate) },
    { header: 'Vence', get: (r) => fecha(r.dueDate) },
    { header: 'Empresa', width: 22, get: (r) => r.organization?.name ?? '' },
    { header: 'Cliente', width: 26, get: (r) => r.clientName ?? '' },
    { header: 'Descripción', width: 34, get: (r) => r.description },
    { header: 'Documento', get: (r) => documento(r.sourceDocumentType, r.sourceFolio) },
    { header: 'RUT', get: (r) => r.sourceRut ?? '' },
    { header: 'Categoría', width: 18, get: (r) => r.category ?? '' },
    { header: 'Monto', width: 14, get: (r) => r.amount },
    { header: 'Neto por cobrar', width: 15, get: (r) => r.netAmount ?? '' },
    { header: 'Estado', get: (r) => INCOME_STATUS[r.status] ?? r.status },
    { header: 'Pagado', get: (r) => fecha(r.paidDate) },
    { header: 'Recurrente', get: (r) => (r.isRecurring ? 'Sí' : 'No') },
    { header: 'Notas', width: 30, get: (r) => r.notes ?? '' },
  ]);
  return workbook([{ name: 'Ingresos', ws }]);
}

// ---------- Gastos ----------

export async function exportExpenses(filters: ListExpenseFilters): Promise<Buffer> {
  const rows = await listExpenses(filters);
  const ws = sheet(rows, [
    { header: 'Fecha', get: (r) => fecha(r.expenseDate) },
    { header: 'Vence', get: (r) => fecha(r.dueDate) },
    { header: 'Empresa', width: 22, get: (r) => r.organization?.name ?? '' },
    { header: 'Proveedor', width: 26, get: (r) => r.vendorName ?? '' },
    { header: 'Descripción', width: 34, get: (r) => r.description },
    { header: 'Documento', get: (r) => documento(r.sourceDocumentType, r.sourceFolio) },
    { header: 'RUT', get: (r) => r.sourceRut ?? '' },
    { header: 'Categoría', width: 18, get: (r) => r.category ?? '' },
    { header: 'Monto', width: 14, get: (r) => r.amount },
    { header: 'Estado', get: (r) => EXPENSE_STATUS[r.status] ?? r.status },
    { header: 'Pagado', get: (r) => fecha(r.paidDate) },
    { header: 'Recurrente', get: (r) => (r.isRecurring ? 'Sí' : 'No') },
    { header: 'Notas', width: 30, get: (r) => r.notes ?? '' },
  ]);
  return workbook([{ name: 'Gastos', ws }]);
}

// ---------- Bancos ----------

export async function exportBank(filters: ListTransactionsFilters): Promise<Buffer> {
  const { transactions } = await listBankTransactions(filters);
  const ws = sheet(transactions, [
    { header: 'Fecha', get: (r) => fecha(r.transactionDate) },
    { header: 'Cuenta', width: 22, get: (r) => r.bankAccount?.name ?? '' },
    { header: 'Descripción', width: 40, get: (r) => r.description },
    { header: 'Documento', get: (r) => r.documentNumber ?? '' },
    { header: 'Canal', get: (r) => r.channel ?? '' },
    { header: 'Cargo', width: 14, get: (r) => r.chargeAmount || '' },
    { header: 'Abono', width: 14, get: (r) => r.creditAmount || '' },
    { header: 'Saldo', width: 14, get: (r) => r.balance ?? '' },
    { header: 'Categoría', width: 18, get: (r) => r.category ?? '' },
    { header: 'Conciliado', get: (r) => (r.reconciled ? 'Sí' : 'No') },
    { header: 'Contraparte', width: 26, get: (r) => r.counterparties.join(', ') },
    { header: 'Traspaso interno', get: (r) => (r.internal ? 'Sí' : 'No') },
  ]);
  return workbook([{ name: 'Bancos', ws }]);
}

// ---------- Reporte consolidado (multi-hoja) ----------

export async function exportReport(filters: {
  organizationId?: string;
  granularity: Granularity;
  period?: string;
}): Promise<Buffer> {
  const { organizationId, granularity, period } = filters;
  const [summary, consolidated, trend] = await Promise.all([
    getSummary(organizationId, { granularity, period }),
    getConsolidated({ organizationId, granularity, period }),
    getTrend({ granularity, last: 12, organizationId }),
  ]);

  // Hoja 1: Resumen (etiqueta / valor).
  const resumen: { concepto: string; valor: number }[] = [
    { concepto: 'Ingresos del mes en curso', valor: summary.monthIncome },
    { concepto: 'Gastos del mes en curso', valor: summary.monthExpense },
    { concepto: 'Resultado estimado del mes', valor: summary.estimatedResult },
    { concepto: 'Ingresos de la semana en curso', valor: summary.weekIncome },
    { concepto: 'Gastos de la semana en curso', valor: summary.weekExpense },
    { concepto: 'Por cobrar', valor: summary.pendingIncome },
    { concepto: 'Por pagar', valor: summary.pendingExpense },
    { concepto: 'Cobrado (histórico)', valor: summary.collectedIncome },
    { concepto: 'Por cobrar vencido', valor: summary.overdueIncome.amount },
    { concepto: 'Por pagar vencido', valor: summary.overdueExpense.amount },
    { concepto: 'Caja en bancos', valor: consolidated.cash },
    { concepto: 'Posición neta (caja + por cobrar − por pagar)', valor: consolidated.position },
  ];
  const wsResumen = sheet(resumen, [
    { header: 'Concepto', width: 44, get: (r) => r.concepto },
    { header: 'Valor (CLP)', width: 18, get: (r) => r.valor },
  ]);

  // Hoja 2: Posición por empresa.
  const wsPosicion = sheet(consolidated.byOrganization, [
    { header: 'Empresa', width: 24, get: (o) => o.name },
    { header: 'Caja', width: 16, get: (o) => o.cash },
    { header: 'Por cobrar', width: 16, get: (o) => o.receivable },
    { header: 'Por pagar', width: 16, get: (o) => o.payable },
    { header: 'Posición', width: 16, get: (o) => o.position },
  ]);

  // Hoja 3: Tendencia (12 períodos).
  const wsTendencia = sheet(trend, [
    { header: 'Período', width: 24, get: (t) => etiquetaPeriodo(t.period) },
    { header: 'Clave', get: (t) => t.period },
    { header: 'Ingresos', width: 16, get: (t) => t.income },
    { header: 'Gastos', width: 16, get: (t) => t.expense },
    { header: 'Resultado', width: 16, get: (t) => t.result },
  ]);

  return workbook([
    { name: 'Resumen', ws: wsResumen },
    { name: 'Posición', ws: wsPosicion },
    { name: 'Tendencia', ws: wsTendencia },
  ]);
}
