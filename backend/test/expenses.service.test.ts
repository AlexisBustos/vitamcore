import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg,
  makeExpense,
  makeBankAccount,
  makeImportBatch,
  makeBankTransaction,
} from './fixtures';
import { prisma } from '../src/lib/prisma';
import * as expenses from '../src/modules/expenses/expenses.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('expenses.list — paymentState', () => {
  test('payable: solo PENDING/OVERDUE sin pagar', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    await makeExpense(org.id, { status: 'OVERDUE', paidDate: null });
    await makeExpense(org.id, { status: 'PAID', paidDate: new Date('2026-07-02') });
    await makeExpense(org.id, { status: 'CANCELLED', paidDate: null });
    const res = await expenses.list({ organizationId: org.id, paymentState: 'payable' } as never);
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.status).sort()).toEqual(['OVERDUE', 'PENDING']);
  });

  test('paid: solo filas con paidDate y status distinto de CANCELLED', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { status: 'PAID', paidDate: new Date('2026-07-02') });
    await makeExpense(org.id, { status: 'PENDING', paidDate: null }); // no pagado
    // status CANCELLED con paidDate seteado igualmente queda fuera por el filtro de status.
    await makeExpense(org.id, { status: 'CANCELLED', paidDate: new Date('2026-07-03') });
    const res = await expenses.list({ organizationId: org.id, paymentState: 'paid' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('PAID');
  });

  test('overdue: por pagar con dueDate en el pasado', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, {
      status: 'PENDING',
      paidDate: null,
      dueDate: new Date('2020-01-01'), // vencido
    });
    await makeExpense(org.id, {
      status: 'PENDING',
      paidDate: null,
      dueDate: new Date('2099-01-01'), // no vencido
    });
    const res = await expenses.list({ organizationId: org.id, paymentState: 'overdue' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].dueDate?.toISOString()).toBe(new Date('2020-01-01').toISOString());
  });

  test('cancelled: status === CANCELLED', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { status: 'CANCELLED', paidDate: null });
    await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const res = await expenses.list({ organizationId: org.id, paymentState: 'cancelled' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('CANCELLED');
  });
});

describe('expenses.update — reconcilePaidStatus', () => {
  test('marcar PAID sin paidDate fija paidDate = ahora', async () => {
    const org = await makeOrg();
    const rec = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const updated = await expenses.update(rec.id, { status: 'PAID' } as never);
    expect(updated.status).toBe('PAID');
    expect(updated.paidDate).not.toBeNull();
  });

  test('marcar PAID cuando ya existe paidDate respeta la fecha existente', async () => {
    const org = await makeOrg();
    const existingPaidDate = new Date('2026-06-15');
    const rec = await makeExpense(org.id, { status: 'PENDING', paidDate: existingPaidDate });
    const updated = await expenses.update(rec.id, { status: 'PAID' } as never);
    expect(updated.paidDate?.toISOString()).toBe(existingPaidDate.toISOString());
  });

  test('sacar de PAID limpia paidDate y paidByBankTransactionId', async () => {
    const org = await makeOrg();
    const rec = await makeExpense(org.id, {
      status: 'PAID',
      paidDate: new Date('2026-06-15'),
    });
    const updated = await expenses.update(rec.id, { status: 'PENDING' } as never);
    expect(updated.status).toBe('PENDING');
    expect(updated.paidDate).toBeNull();
    expect(updated.paidByBankTransactionId).toBeNull();
  });

  test('update sin tocar status no modifica paidDate', async () => {
    const org = await makeOrg();
    const existingPaidDate = new Date('2026-06-15');
    const rec = await makeExpense(org.id, {
      status: 'PAID',
      paidDate: existingPaidDate,
    });
    const updated = await expenses.update(rec.id, { description: 'Actualizado' } as never);
    expect(updated.paidDate?.toISOString()).toBe(existingPaidDate.toISOString());
  });
});

describe('expenses.create — enlace de proveedor por nombre', () => {
  test('crea el proveedor y enlaza vendorId cuando se envía vendorName', async () => {
    const org = await makeOrg();
    const created = await expenses.create({
      organizationId: org.id,
      vendorName: 'Proveedor Nuevo SPA',
      description: 'Gasto de prueba',
      amount: 50000,
      currency: 'CLP',
      status: 'PENDING',
      expenseDate: new Date('2026-07-01'),
    } as never);
    expect(created.vendorId).toBeTruthy();
  });
});

describe('expenses.registerPayment', () => {
  test('con paidDate marca status PAID y fija paidDate', async () => {
    const org = await makeOrg();
    const rec = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const paidDate = new Date('2026-07-10');
    const updated = await expenses.registerPayment(rec.id, { paidDate } as never);
    expect(updated.status).toBe('PAID');
    expect(updated.paidDate?.toISOString()).toBe(paidDate.toISOString());
  });

  test('sin paidDate deja status PENDING y paidDate null', async () => {
    const org = await makeOrg();
    const rec = await makeExpense(org.id, { status: 'PAID', paidDate: new Date('2026-06-01') });
    const updated = await expenses.registerPayment(rec.id, { paidDate: null } as never);
    expect(updated.status).toBe('PENDING');
    expect(updated.paidDate).toBeNull();
    expect(updated.paidByBankTransactionId).toBeNull();
  });

  test('rechaza un gasto anulado', async () => {
    const org = await makeOrg();
    const anulado = await makeExpense(org.id, { status: 'CANCELLED', paidDate: null });
    await expect(
      expenses.registerPayment(anulado.id, { paidDate: new Date('2026-07-10') } as never),
    ).rejects.toThrow('Un gasto anulado no se paga');
  });

  test('rama bancaria: concilia contra el movimiento y copia su fecha', async () => {
    const org = await makeOrg();
    const rec = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const account = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id);
    const transactionDate = new Date('2026-07-05');
    const mov = await makeBankTransaction(
      { organizationId: org.id, bankAccountId: account.id, importBatchId: batch.id },
      { chargeAmount: 50000, transactionDate },
    );
    const updated = await expenses.registerPayment(rec.id, { bankTransactionId: mov.id } as never);
    expect(updated.status).toBe('PAID');
    expect(updated.paidByBankTransactionId).toBe(mov.id);
    expect(updated.paidDate?.toISOString()).toBe(transactionDate.toISOString());
  });

  test('rama bancaria: rechaza un movimiento de otra empresa', async () => {
    const org = await makeOrg();
    const otra = await makeOrg('Otra Empresa');
    const rec = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const account = await makeBankAccount(otra.id);
    const batch = await makeImportBatch(otra.id);
    const mov = await makeBankTransaction(
      { organizationId: otra.id, bankAccountId: account.id, importBatchId: batch.id },
      { chargeAmount: 50000 },
    );
    await expect(
      expenses.registerPayment(rec.id, { bankTransactionId: mov.id } as never),
    ).rejects.toThrow('El movimiento no pertenece a la empresa del gasto');
  });

  test('rama bancaria: rechaza un movimiento que no es un cargo (chargeAmount <= 0)', async () => {
    const org = await makeOrg();
    const rec = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const account = await makeBankAccount(org.id);
    const batch = await makeImportBatch(org.id);
    const mov = await makeBankTransaction(
      { organizationId: org.id, bankAccountId: account.id, importBatchId: batch.id },
      { chargeAmount: 0, creditAmount: 50000 },
    );
    await expect(
      expenses.registerPayment(rec.id, { bankTransactionId: mov.id } as never),
    ).rejects.toThrow('El movimiento no es un cargo');
  });
});

describe('expenses.list — search', () => {
  test('encuentra por vendorName (insensible a mayúsculas)', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { vendorName: 'Ferretería El Roble' });
    await makeExpense(org.id, { vendorName: 'Otro Proveedor' });
    const res = await expenses.list({ organizationId: org.id, search: 'roble' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].vendorName).toBe('Ferretería El Roble');
  });

  test('encuentra por folio y por RUT', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { vendorName: 'A', sourceFolio: '99887' });
    await makeExpense(org.id, { vendorName: 'B', sourceRut: '77.222.333-4' });
    expect(await expenses.list({ organizationId: org.id, search: '99887' } as never)).toHaveLength(1);
    expect(await expenses.list({ organizationId: org.id, search: '77.222' } as never)).toHaveLength(1);
  });

  test('compone search con paymentState payable', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { vendorName: 'Proveedor X', status: 'PENDING', paidDate: null });
    await makeExpense(org.id, { vendorName: 'Proveedor X', status: 'PAID', paidDate: new Date('2026-07-02') });
    await makeExpense(org.id, { vendorName: 'Proveedor Y', status: 'PENDING', paidDate: null });
    const res = await expenses.list({
      organizationId: org.id,
      paymentState: 'payable',
      search: 'proveedor x',
    } as never);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('PENDING');
  });
});

describe('expenses.bulkRegisterPayment', () => {
  async function movimiento(orgId: string, overrides: Record<string, unknown>) {
    const account = await makeBankAccount(orgId);
    const batch = await makeImportBatch(orgId);
    return makeBankTransaction(
      { organizationId: orgId, bankAccountId: account.id, importBatchId: batch.id },
      overrides,
    );
  }

  test('concilia varios gastos contra un movimiento (misma fecha del movimiento)', async () => {
    const org = await makeOrg();
    const g1 = await makeExpense(org.id, { status: 'PENDING', amount: 30000, paidDate: null });
    const g2 = await makeExpense(org.id, { status: 'PENDING', amount: 20000, paidDate: null });
    const transactionDate = new Date('2026-07-05');
    const mov = await movimiento(org.id, { chargeAmount: 50000, transactionDate });
    const res = await expenses.bulkRegisterPayment({ ids: [g1.id, g2.id], bankTransactionId: mov.id } as never);
    expect(res.count).toBe(2);
    const rows = await prisma.expenseRecord.findMany({ where: { id: { in: [g1.id, g2.id] } } });
    expect(rows.every((r) => r.status === 'PAID')).toBe(true);
    expect(rows.every((r) => r.paidByBankTransactionId === mov.id)).toBe(true);
    expect(rows.every((r) => r.paidDate?.toISOString() === transactionDate.toISOString())).toBe(true);
  });

  test('marca varios como pagados con fecha manual', async () => {
    const org = await makeOrg();
    const g1 = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const g2 = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const paidDate = new Date('2026-07-11');
    const res = await expenses.bulkRegisterPayment({ ids: [g1.id, g2.id], paidDate } as never);
    expect(res.count).toBe(2);
    const rows = await prisma.expenseRecord.findMany({ where: { id: { in: [g1.id, g2.id] } } });
    expect(rows.every((r) => r.status === 'PAID' && r.paidDate?.toISOString() === paidDate.toISOString())).toBe(true);
  });

  test('revierte varios (paidDate y bankTransactionId null → PENDING)', async () => {
    const org = await makeOrg();
    const g1 = await makeExpense(org.id, { status: 'PAID', paidDate: new Date('2026-07-01') });
    const g2 = await makeExpense(org.id, { status: 'PAID', paidDate: new Date('2026-07-01') });
    const res = await expenses.bulkRegisterPayment({ ids: [g1.id, g2.id], paidDate: null, bankTransactionId: null } as never);
    expect(res.count).toBe(2);
    const rows = await prisma.expenseRecord.findMany({ where: { id: { in: [g1.id, g2.id] } } });
    expect(rows.every((r) => r.status === 'PENDING' && r.paidDate === null && r.paidByBankTransactionId === null)).toBe(true);
  });

  test('rechaza si los gastos son de distinta empresa', async () => {
    const org = await makeOrg();
    const otra = await makeOrg('Otra Empresa');
    const g1 = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const g2 = await makeExpense(otra.id, { status: 'PENDING', paidDate: null });
    await expect(
      expenses.bulkRegisterPayment({ ids: [g1.id, g2.id], paidDate: new Date('2026-07-11') } as never),
    ).rejects.toThrow('misma empresa');
  });

  test('rechaza si la selección incluye un gasto anulado', async () => {
    const org = await makeOrg();
    const g1 = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const anulado = await makeExpense(org.id, { status: 'CANCELLED', paidDate: null });
    await expect(
      expenses.bulkRegisterPayment({ ids: [g1.id, anulado.id], paidDate: new Date('2026-07-11') } as never),
    ).rejects.toThrow('anulado');
  });

  test('rama bancaria: rechaza un movimiento que no es un cargo', async () => {
    const org = await makeOrg();
    const g1 = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    const mov = await movimiento(org.id, { chargeAmount: 0, creditAmount: 50000 });
    await expect(
      expenses.bulkRegisterPayment({ ids: [g1.id], bankTransactionId: mov.id } as never),
    ).rejects.toThrow('no es un cargo');
  });

  test('rechaza ids inexistentes', async () => {
    const org = await makeOrg();
    const g1 = await makeExpense(org.id, { status: 'PENDING', paidDate: null });
    await expect(
      expenses.bulkRegisterPayment({ ids: [g1.id, 'inexistente'], paidDate: new Date('2026-07-11') } as never),
    ).rejects.toThrow('no fue encontrado');
  });
});

describe('expenses.listPeriodsWithExpense', () => {
  test('devuelve los meses con datos, orden descendente', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { expenseDate: new Date('2026-05-15') });
    await makeExpense(org.id, { expenseDate: new Date('2026-07-01') });
    const months = await expenses.listPeriodsWithExpense('month', org.id);
    expect(months[0]).toBe('2026-07');
    expect(months).toContain('2026-05');
  });
});
