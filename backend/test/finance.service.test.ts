import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg,
  makeIncome,
  makeExpense,
  makeBankAccount,
  makeImportBatch,
  makeBankTransaction,
} from './fixtures';
import * as finance from '../src/modules/finance/finance.service';
import * as income from '../src/modules/income/income.service';

beforeEach(resetDb);
afterAll(disconnect);

// ---------------------------------------------------------------------------
// getSummary — KPIs de por cobrar / por pagar / vencidos / cobrado
// ---------------------------------------------------------------------------
describe('finance.getSummary', () => {
  test('receivable/payable/overdue/collected con montos redondos', async () => {
    const org = await makeOrg();

    // Por cobrar: dos facturas emitidas sin pagar (netAmount > 0, paidDate null).
    await makeIncome(org.id, {
      status: 'INVOICED',
      netAmount: 100000,
      amount: 100000,
      paidDate: null,
      dueDate: new Date('2099-01-01'), // no vencida
    });
    await makeIncome(org.id, {
      status: 'INVOICED',
      netAmount: 100000,
      amount: 100000,
      paidDate: null,
      dueDate: new Date('2020-01-01'), // vencida
    });
    // Cobrado: pagada (paidDate seteada) -> no cuenta en receivable, sí en collected.
    await makeIncome(org.id, {
      status: 'PAID',
      netAmount: 200000,
      amount: 200000,
      paidDate: new Date('2026-06-15'),
    });

    // Por pagar: dos gastos pendientes (uno vencido).
    await makeExpense(org.id, {
      status: 'PENDING',
      amount: 50000,
      dueDate: new Date('2099-01-01'), // no vencido
    });
    await makeExpense(org.id, {
      status: 'PENDING',
      amount: 30000,
      dueDate: new Date('2020-01-01'), // vencido
    });

    const summary = await finance.getSummary(org.id);

    expect(summary.pendingIncome).toBe(200000); // 100000 + 100000
    expect(summary.pendingExpense).toBe(80000); // 50000 + 30000
    expect(summary.collectedIncome).toBe(200000);
    expect(summary.overdueIncome).toEqual({ count: 1, amount: 100000 });
    expect(summary.overdueExpense).toEqual({ count: 1, amount: 30000 });
  });

  test('facturas manuales sin netAmount en estado pendiente cuentan por su amount', async () => {
    const org = await makeOrg();
    // netAmount null + status pendiente -> entra por la segunda rama (amount).
    await makeIncome(org.id, { status: 'EXPECTED', netAmount: null, amount: 70000 });
    const summary = await finance.getSummary(org.id);
    expect(summary.pendingIncome).toBe(70000);
  });

  test('nota de crédito y cancelados no cuentan en por cobrar', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { documentKind: 'CREDIT_NOTE', amount: -20000, netAmount: null });
    await makeIncome(org.id, { status: 'CANCELLED', netAmount: 100000, amount: 100000 });
    const summary = await finance.getSummary(org.id);
    expect(summary.pendingIncome).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getConsolidated — posición (caja + por cobrar - por pagar)
// ---------------------------------------------------------------------------
describe('finance.getConsolidated', () => {
  test('caja = último balance por cuenta activa; posición = caja + cobrar - pagar', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });
    // Dos movimientos: el último (fecha mayor) fija el balance de la cuenta.
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { creditAmount: 100000, balance: 300000, transactionDate: new Date('2026-07-01') },
    );
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { creditAmount: 100000, balance: 500000, transactionDate: new Date('2026-07-10') },
    );

    // Por cobrar 100000, por pagar 40000.
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, amount: 100000, paidDate: null });
    await makeExpense(org.id, { status: 'PENDING', amount: 40000 });

    const consolidated = await finance.getConsolidated({ organizationId: org.id });

    expect(consolidated.cash).toBe(500000);
    expect(consolidated.receivable).toBe(100000);
    expect(consolidated.payable).toBe(40000);
    expect(consolidated.position).toBe(560000); // 500000 + 100000 - 40000

    expect(consolidated.byOrganization).toHaveLength(1);
    expect(consolidated.byOrganization[0]).toMatchObject({
      organizationId: org.id,
      cash: 500000,
      receivable: 100000,
      payable: 40000,
      position: 560000,
    });
  });
});

// ---------------------------------------------------------------------------
// autoReconcile — conciliación conservadora (solo pares de monto único)
// ---------------------------------------------------------------------------
describe('finance.autoReconcile', () => {
  test('enlaza solo el cruce inequívoco 1:1', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });
    const inc = await makeIncome(org.id, {
      status: 'INVOICED',
      netAmount: 100000,
      amount: 100000,
      paidDate: null,
    });
    const mov = await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { creditAmount: 100000, transactionDate: new Date('2026-07-05') },
    );

    const res = await finance.autoReconcile({ organizationId: org.id, apply: true });

    expect(res.pairs).toBe(1);
    expect(res.linkedIncome).toBe(1);
    expect(res.ambiguousAmounts).toBe(0);

    const paid = await income.list({ organizationId: org.id, paymentState: 'paid' } as never);
    expect(paid).toHaveLength(1);
    expect(paid[0].id).toBe(inc.id);
    expect(paid[0].paidByBankTransactionId).toBe(mov.id);
    expect(paid[0].status).toBe('PAID');
  });

  test('ambigüedad (dos facturas del mismo monto) no enlaza nada', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, amount: 100000, paidDate: null });
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, amount: 100000, paidDate: null });
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { creditAmount: 100000, transactionDate: new Date('2026-07-05') },
    );

    const res = await finance.autoReconcile({ organizationId: org.id, apply: true });

    expect(res.pairs).toBe(0);
    expect(res.linkedIncome).toBe(0);
    expect(res.ambiguousAmounts).toBe(1);

    const paid = await income.list({ organizationId: org.id, paymentState: 'paid' } as never);
    expect(paid).toHaveLength(0);
  });

  test('preview (apply:false) no escribe nada aunque haya un par inequívoco', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, amount: 100000, paidDate: null });
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { creditAmount: 100000, transactionDate: new Date('2026-07-05') },
    );

    const res = await finance.autoReconcile({ organizationId: org.id, apply: false });
    expect(res.pairs).toBe(1);
    expect(res.linkedIncome).toBe(1);

    const paid = await income.list({ organizationId: org.id, paymentState: 'paid' } as never);
    expect(paid).toHaveLength(0); // preview no persiste
  });
});

// ---------------------------------------------------------------------------
// getReconciliationSummary — traspasos internos excluidos del cuadre
// ---------------------------------------------------------------------------
describe('finance.getReconciliationSummary', () => {
  test('el traspaso interno se excluye del cuadre y va a `internal`', async () => {
    const org = await makeOrg();
    // Cuenta con nº >= 6 dígitos para que se detecte como cuenta propia.
    const acc = await makeBankAccount(org.id, { accountNumber: '12345678' });
    const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });

    // Traspaso interno: descripción referencia la cuenta propia -> excluido.
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { chargeAmount: 50000, description: 'Traspaso A Cuenta: 12345678' },
    );
    // Movimiento normal (abono a tercero) -> cuenta en el cuadre.
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { creditAmount: 100000, description: 'Abono cliente' },
    );

    const summary = await finance.getReconciliationSummary({ organizationId: org.id });

    expect(summary.internal).toEqual({ count: 1, amount: 50000 });
    expect(summary.credits.total).toBe(100000);
    expect(summary.credits.suelto).toBe(100000);
    expect(summary.credits.conciliado).toBe(0);
    expect(summary.charges.total).toBe(0); // el cargo era interno, no cuenta
    expect(summary.unlinkedCount).toBe(1); // solo el abono normal, sin factura enlazada
  });

  test('sin cuentas propias de >= 6 dígitos, un "Traspaso" no se marca interno', async () => {
    const org = await makeOrg();
    // Cuenta por defecto '000-111' normaliza a '111' (< 6) -> no es cuenta propia.
    const acc = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });
    await makeBankTransaction(
      { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
      { chargeAmount: 50000, description: 'Traspaso A Cuenta: 999999' },
    );

    const summary = await finance.getReconciliationSummary({ organizationId: org.id });
    expect(summary.internal).toEqual({ count: 0, amount: 0 });
    expect(summary.charges.total).toBe(50000);
  });
});
