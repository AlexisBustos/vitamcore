import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg,
  makeIncome,
  makeBankAccount,
  makeImportBatch,
  makeBankTransaction,
} from './fixtures';
import { prisma } from '../src/lib/prisma';
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

describe('income.list — search', () => {
  test('encuentra por clientName (insensible a mayúsculas)', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { clientName: 'Clínica Los Andes', netAmount: 100000 });
    await makeIncome(org.id, { clientName: 'Otra Empresa', netAmount: 100000 });
    const res = await income.list({ organizationId: org.id, search: 'andes' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].clientName).toBe('Clínica Los Andes');
  });

  test('encuentra por folio y por RUT', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { clientName: 'A', sourceFolio: '12345', netAmount: 100000 });
    await makeIncome(org.id, { clientName: 'B', sourceRut: '76.111.222-3', netAmount: 100000 });
    expect(await income.list({ organizationId: org.id, search: '12345' } as never)).toHaveLength(1);
    expect(await income.list({ organizationId: org.id, search: '76.111' } as never)).toHaveLength(1);
  });

  test('compone search con paymentState receivable sin pisar el OR de cobrables', async () => {
    const org = await makeOrg();
    // Cobrable que calza el nombre → sí sale.
    await makeIncome(org.id, { clientName: 'Cliente X', status: 'INVOICED', netAmount: 100000 });
    // Pagada que calza el nombre → NO debe salir en receivable.
    await makeIncome(org.id, {
      clientName: 'Cliente X',
      status: 'PAID',
      paidDate: new Date('2026-07-02'),
      netAmount: 100000,
    });
    // Cobrable con otro nombre → no calza el search.
    await makeIncome(org.id, { clientName: 'Cliente Y', status: 'INVOICED', netAmount: 100000 });
    const res = await income.list({
      organizationId: org.id,
      paymentState: 'receivable',
      search: 'cliente x',
    } as never);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('INVOICED');
  });
});

describe('income.bulkRegisterPayment', () => {
  async function movimiento(orgId: string, overrides: Record<string, unknown>) {
    const account = await makeBankAccount(orgId);
    const batch = await makeImportBatch(orgId);
    return makeBankTransaction(
      { organizationId: orgId, bankAccountId: account.id, importBatchId: batch.id },
      overrides,
    );
  }

  test('concilia varias facturas contra un movimiento (misma fecha del movimiento)', async () => {
    const org = await makeOrg();
    const f1 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 60000, paidDate: null });
    const f2 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 40000, paidDate: null });
    const transactionDate = new Date('2026-07-05');
    const mov = await movimiento(org.id, { creditAmount: 100000, transactionDate });
    const res = await income.bulkRegisterPayment({ ids: [f1.id, f2.id], bankTransactionId: mov.id } as never);
    expect(res.count).toBe(2);
    const rows = await prisma.incomeRecord.findMany({ where: { id: { in: [f1.id, f2.id] } } });
    expect(rows.every((r) => r.status === 'PAID')).toBe(true);
    expect(rows.every((r) => r.paidByBankTransactionId === mov.id)).toBe(true);
    expect(rows.every((r) => r.paidDate?.toISOString() === transactionDate.toISOString())).toBe(true);
  });

  test('marca varias como pagadas con fecha manual', async () => {
    const org = await makeOrg();
    const f1 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 60000, paidDate: null });
    const f2 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 40000, paidDate: null });
    const paidDate = new Date('2026-07-11');
    const res = await income.bulkRegisterPayment({ ids: [f1.id, f2.id], paidDate } as never);
    expect(res.count).toBe(2);
    const rows = await prisma.incomeRecord.findMany({ where: { id: { in: [f1.id, f2.id] } } });
    expect(rows.every((r) => r.status === 'PAID' && r.paidDate?.toISOString() === paidDate.toISOString())).toBe(true);
  });

  test('revierte varias (paidDate y bankTransactionId null → INVOICED)', async () => {
    const org = await makeOrg();
    const f1 = await makeIncome(org.id, { status: 'PAID', netAmount: 60000, paidDate: new Date('2026-07-01') });
    const f2 = await makeIncome(org.id, { status: 'PAID', netAmount: 40000, paidDate: new Date('2026-07-01') });
    const res = await income.bulkRegisterPayment({ ids: [f1.id, f2.id], paidDate: null, bankTransactionId: null } as never);
    expect(res.count).toBe(2);
    const rows = await prisma.incomeRecord.findMany({ where: { id: { in: [f1.id, f2.id] } } });
    expect(rows.every((r) => r.status === 'INVOICED' && r.paidDate === null && r.paidByBankTransactionId === null)).toBe(true);
  });

  test('rechaza si las facturas son de distinta empresa', async () => {
    const org = await makeOrg();
    const otra = await makeOrg('Otra Empresa');
    const f1 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const f2 = await makeIncome(otra.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    await expect(
      income.bulkRegisterPayment({ ids: [f1.id, f2.id], paidDate: new Date('2026-07-11') } as never),
    ).rejects.toThrow('misma empresa');
  });

  test('rechaza si la selección incluye una nota de crédito', async () => {
    const org = await makeOrg();
    const f1 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const nc = await makeIncome(org.id, { documentKind: 'CREDIT_NOTE', amount: -20000, netAmount: null });
    await expect(
      income.bulkRegisterPayment({ ids: [f1.id, nc.id], paidDate: new Date('2026-07-11') } as never),
    ).rejects.toThrow('nota de crédito');
  });

  test('rama bancaria: rechaza un movimiento que no es un abono', async () => {
    const org = await makeOrg();
    const f1 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    const mov = await movimiento(org.id, { creditAmount: 0, chargeAmount: 50000 });
    await expect(
      income.bulkRegisterPayment({ ids: [f1.id], bankTransactionId: mov.id } as never),
    ).rejects.toThrow('no es un abono');
  });

  test('rechaza ids inexistentes', async () => {
    const org = await makeOrg();
    const f1 = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, paidDate: null });
    await expect(
      income.bulkRegisterPayment({ ids: [f1.id, 'inexistente'], paidDate: new Date('2026-07-11') } as never),
    ).rejects.toThrow('no fue encontrada');
  });
});

describe('income.listPeriodsWithIncome', () => {
  test('devuelve los meses con datos, orden descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-05-15') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-01') });
    const months = await income.listPeriodsWithIncome('month', org.id);
    expect(months[0]).toBe('2026-07');
    expect(months).toContain('2026-05');
  });

  test('por semana devuelve claves ISO', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-07-06') }); // W28
    const weeks = await income.listPeriodsWithIncome('week', org.id);
    expect(weeks).toEqual(['2026-W28']);
  });
});
