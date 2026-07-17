/**
 * Controllers de exportación a Excel. Reutilizan los MISMOS schemas de filtro
 * que las vistas (ingresos/gastos/bancos/resumen), así el Excel refleja
 * exactamente lo que el usuario está viendo.
 */
import type { Request, Response } from 'express';
import * as service from './finance-export.service';
import { listIncomeQuery } from '../income/income.schema';
import { listExpenseQuery } from '../expenses/expenses.schema';
import { listTransactionsQuery } from '../finance-imports/finance-imports.schema';
import { summaryQuery } from '../finance/finance.schema';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Fecha de hoy (UTC) para el nombre del archivo. */
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function sendXlsx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export async function exportIncomeController(req: Request, res: Response) {
  const filters = listIncomeQuery.parse(req.query);
  sendXlsx(res, await service.exportIncome(filters), `ingresos-${stamp()}.xlsx`);
}

export async function exportExpensesController(req: Request, res: Response) {
  const filters = listExpenseQuery.parse(req.query);
  sendXlsx(res, await service.exportExpenses(filters), `gastos-${stamp()}.xlsx`);
}

export async function exportBankController(req: Request, res: Response) {
  const filters = listTransactionsQuery.parse(req.query);
  sendXlsx(res, await service.exportBank(filters), `bancos-${stamp()}.xlsx`);
}

export async function exportReportController(req: Request, res: Response) {
  const filters = summaryQuery.parse(req.query);
  sendXlsx(res, await service.exportReport(filters), `reporte-financiero-${stamp()}.xlsx`);
}
