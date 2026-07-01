import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg,
  makeIncome,
  makeBankAccount,
  makeImportBatch,
  makeBankTransaction,
} from './fixtures';
import * as income from '../src/modules/income/income.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('income.list — paymentState', () => {
  test('receivable excluye NC, pagados y cancelados', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000 });
    await makeIncome(org.id, { status: 'PAID', paidDate: new Date('2026-07-02'), netAmount: 100000 });
    await makeIncome(org.id, { documentKind: 'CREDIT_NOTE', amount: -20000, netAmount: null });
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 0 }); // anulada por NC
    const res = await income.list({ organizationId: org.id, paymentState: 'receivable' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('INVOICED');
  });

  test('receivable incluye registros manuales sin netAmount en estado pendiente', async () => {
    const org = await makeOrg();
    // Ingreso manual (sin netAmount) en estado pendiente -> debe entrar por la segunda rama del OR.
    await makeIncome(org.id, { status: 'EXPECTED', netAmount: null });
    const res = await income.list({ organizationId: org.id, paymentState: 'receivable' } as never);
    expect(res).toHaveLength(1);
  });

  test('paid: solo filas con paidDate y status distinto de CANCELLED', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'PAID', paidDate: new Date('2026-07-02'), netAmount: 100000 });
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000 }); // no pagado
    // status CANCELLED pero con paidDate seteado igualmente queda fuera por el filtro de status.
    await makeIncome(org.id, { status: 'CANCELLED', paidDate: new Date('2026-07-03'), netAmount: 100000 });
    const res = await income.list({ organizationId: org.id, paymentState: 'paid' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('PAID');
  });

  test('overdue: por cobrar con dueDate en el pasado', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, {
      status: 'INVOICED',
      netAmount: 100000,
      dueDate: new Date('2020-01-01'), // vencida
    });
    await makeIncome(org.id, {
      status: 'INVOICED',
      netAmount: 100000,
      dueDate: new Date('2099-01-01'), // no vencida
    });
    const res = await income.list({ organizationId: org.id, paymentState: 'overdue' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].dueDate?.toISOString()).toBe(new Date('2020-01-01').toISOString());
  });

  test('cancelled: netAmount === 0 (no depende de status CANCELLED)', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 0 }); // anulada por NC, status sigue INVOICED
    await makeIncome(org.id, { status: 'CANCELLED', netAmount: 100000 }); // status CANCELLED pero netAmount != 0
    const res = await income.list({ organizationId: org.id, paymentState: 'cancelled' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].netAmount).toBe(0);
    expect(res[0].status).toBe('INVOICED');
  });
});

describe('income.update — reconcilePaidStatus', () => {
  test('marcar PAID sin paidDate fija paidDate = ahora', async () => {
    const org = await makeOrg();
    const rec = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const updated = await income.update(rec.id, { status: 'PAID' } as never);
    expect(updated.status).toBe('PAID');
    expect(updated.paidDate).not.toBeNull();
  });

  test('marcar PAID cuando ya existe paidDate respeta la fecha existente', async () => {
    const org = await makeOrg();
    const existingPaidDate = new Date('2026-06-15');
    const rec = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: existingPaidDate });
    const updated = await income.update(rec.id, { status: 'PAID' } as never);
    expect(updated.paidDate?.toISOString()).toBe(existingPaidDate.toISOString());
  });

  test('sacar de PAID limpia paidDate y paidByBankTransactionId', async () => {
    const org = await makeOrg();
    const rec = await makeIncome(org.id, {
      status: 'PAID',
      netAmount: 100000,
      paidDate: new Date('2026-06-15'),
    });
    const updated = await income.update(rec.id, { status: 'INVOICED' } as never);
    expect(updated.status).toBe('INVOICED');
    expect(updated.paidDate).toBeNull();
    expect(updated.paidByBankTransactionId).toBeNull();
  });

  test('update sin tocar status no modifica paidDate', async () => {
    const org = await makeOrg();
    const existingPaidDate = new Date('2026-06-15');
    const rec = await makeIncome(org.id, {
      status: 'PAID',
      netAmount: 100000,
      paidDate: existingPaidDate,
    });
    const updated = await income.update(rec.id, { description: 'Actualizado' } as never);
    expect(updated.paidDate?.toISOString()).toBe(existingPaidDate.toISOString());
  });
});

describe('income.create — enlace de cliente por nombre', () => {
  test('crea el cliente y enlaza clientId cuando se envía clientName', async () => {
    const org = await makeOrg();
    const created = await income.create({
      organizationId: org.id,
      clientName: 'Cliente Nuevo SPA',
      description: 'Factura de prueba',
      amount: 100000,
      currency: 'CLP',
      status: 'INVOICED',
      incomeDate: new Date('2026-07-01'),
    } as never);
    expect(created.clientId).toBeTruthy();
  });
});

describe('income.registerPayment', () => {
  test('con paidDate marca status PAID y fija paidDate', async () => {
    const org = await makeOrg();
    const rec = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const paidDate = new Date('2026-07-10');
    const updated = await income.registerPayment(rec.id, { paidDate } as never);
    expect(updated.status).toBe('PAID');
    expect(updated.paidDate?.toISOString()).toBe(paidDate.toISOString());
  });

  test('sin paidDate deja status INVOICED y paidDate null', async () => {
    const org = await makeOrg();
    const rec = await makeIncome(org.id, { status: 'PAID', netAmount: 100000, paidDate: new Date('2026-06-01') });
    const updated = await income.registerPayment(rec.id, { paidDate: null } as never);
    expect(updated.status).toBe('INVOICED');
    expect(updated.paidDate).toBeNull();
    expect(updated.paidByBankTransactionId).toBeNull();
  });

  test('rechaza una nota de crédito', async () => {
    const org = await makeOrg();
    const nc = await makeIncome(org.id, { documentKind: 'CREDIT_NOTE', amount: -20000, netAmount: null });
    await expect(
      income.registerPayment(nc.id, { paidDate: new Date('2026-07-10') } as never),
    ).rejects.toThrow('Una nota de crédito no se cobra');
  });

  test('rechaza una factura anulada (netAmount === 0)', async () => {
    const org = await makeOrg();
    const anulada = await makeIncome(org.id, { status: 'INVOICED', netAmount: 0 });
    await expect(
      income.registerPayment(anulada.id, { paidDate: new Date('2026-07-10') } as never),
    ).rejects.toThrow('Una factura anulada no se cobra');
  });

  test('rama bancaria: concilia contra el movimiento y copia su fecha', async () => {
    const org = await makeOrg();
    const rec = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const account = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id);
    const transactionDate = new Date('2026-07-05');
    const mov = await makeBankTransaction(
      { organizationId: org.id, bankAccountId: account.id, importBatchId: batch.id },
      { creditAmount: 100000, transactionDate },
    );
    const updated = await income.registerPayment(rec.id, { bankTransactionId: mov.id } as never);
    expect(updated.status).toBe('PAID');
    expect(updated.paidByBankTransactionId).toBe(mov.id);
    expect(updated.paidDate?.toISOString()).toBe(transactionDate.toISOString());
  });

  test('rama bancaria: rechaza un movimiento de otra empresa', async () => {
    const org = await makeOrg();
    const otra = await makeOrg('Otra Empresa');
    const rec = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const account = await makeBankAccount(otra.id);
    const batch = await makeImportBatch(otra.id);
    const mov = await makeBankTransaction(
      { organizationId: otra.id, bankAccountId: account.id, importBatchId: batch.id },
      { creditAmount: 100000 },
    );
    await expect(
      income.registerPayment(rec.id, { bankTransactionId: mov.id } as never),
    ).rejects.toThrow('El movimiento no pertenece a la empresa del ingreso');
  });

  test('rama bancaria: rechaza un movimiento que no es un abono (creditAmount <= 0)', async () => {
    const org = await makeOrg();
    const rec = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const account = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id);
    const mov = await makeBankTransaction(
      { organizationId: org.id, bankAccountId: account.id, importBatchId: batch.id },
      { creditAmount: 0, chargeAmount: 50000 },
    );
    await expect(
      income.registerPayment(rec.id, { bankTransactionId: mov.id } as never),
    ).rejects.toThrow('El movimiento no es un abono');
  });
});

describe('income.listMonths', () => {
  test('devuelve los meses con datos, orden descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-05-15') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-01') });
    const months = await income.listMonths(org.id);
    expect(months[0]).toBe('2026-07');
    expect(months).toContain('2026-05');
  });
});
