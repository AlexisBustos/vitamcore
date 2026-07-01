import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeClient, makeIncome } from './fixtures';
import * as clients from '../src/modules/clients/clients.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('clients.getClient — computeStats', () => {
  test('collected/pending separan pagadas de por cobrar y excluyen NC/anuladas', async () => {
    const org = await makeOrg();
    const cli = await makeClient(org.id, { rut: 'ACME', name: 'ACME' });
    await makeIncome(org.id, { clientId: cli.id, amount: 100000, status: 'INVOICED' });
    await makeIncome(org.id, {
      clientId: cli.id,
      amount: 50000,
      status: 'PAID',
      paidDate: new Date('2026-07-02'),
    });
    await makeIncome(org.id, { clientId: cli.id, documentKind: 'CREDIT_NOTE', amount: -10000 });
    const detail = await clients.getClient(cli.id);
    expect(detail.stats.collectedAmount).toBe(50000);
    expect(detail.stats.pendingAmount).toBe(100000);
  });

  test('CANCELLED se excluye de collected y de pending', async () => {
    const org = await makeOrg();
    const cli = await makeClient(org.id);
    await makeIncome(org.id, { clientId: cli.id, amount: 100000, status: 'CANCELLED', paidDate: null });
    await makeIncome(org.id, {
      clientId: cli.id,
      amount: 70000,
      status: 'CANCELLED',
      paidDate: new Date('2026-07-02'),
    });
    const detail = await clients.getClient(cli.id);
    expect(detail.stats.collectedAmount).toBe(0);
    expect(detail.stats.pendingAmount).toBe(0);
  });

  test('las notas de crédito no se cuentan como cobradas ni por cobrar', async () => {
    const org = await makeOrg();
    const cli = await makeClient(org.id);
    await makeIncome(org.id, { clientId: cli.id, documentKind: 'CREDIT_NOTE', amount: -10000 });
    const detail = await clients.getClient(cli.id);
    expect(detail.stats.collectedAmount).toBe(0);
    expect(detail.stats.pendingAmount).toBe(0);
    expect(detail.stats.totalCreditNotes).toBe(10000);
    expect(detail.stats.creditNoteCount).toBe(1);
    expect(detail.stats.invoiceCount).toBe(0);
  });

  test('netSales, grossInvoiced, totalCreditNotes, invoiceCount, creditNoteCount y documentCount', async () => {
    const org = await makeOrg();
    const cli = await makeClient(org.id);
    await makeIncome(org.id, { clientId: cli.id, amount: 100000, status: 'INVOICED' });
    await makeIncome(org.id, {
      clientId: cli.id,
      amount: 50000,
      status: 'PAID',
      paidDate: new Date('2026-07-02'),
    });
    await makeIncome(org.id, { clientId: cli.id, documentKind: 'CREDIT_NOTE', amount: -10000 });
    const detail = await clients.getClient(cli.id);
    // netSales suma todo (incluye el monto negativo de la NC).
    expect(detail.stats.netSales).toBe(140000);
    // grossInvoiced solo suma lo que no es NC.
    expect(detail.stats.grossInvoiced).toBe(150000);
    expect(detail.stats.totalCreditNotes).toBe(10000);
    expect(detail.stats.invoiceCount).toBe(2);
    expect(detail.stats.creditNoteCount).toBe(1);
    expect(detail.stats.documentCount).toBe(3);
  });

  test('lastDocumentDate usa sourceIssueDate o incomeDate como respaldo, el más reciente de todos los ingresos', async () => {
    const org = await makeOrg();
    const cli = await makeClient(org.id);
    await makeIncome(org.id, { clientId: cli.id, incomeDate: new Date('2026-05-01') });
    await makeIncome(org.id, { clientId: cli.id, incomeDate: new Date('2026-07-15') });
    const detail = await clients.getClient(cli.id);
    expect(detail.stats.lastDocumentDate?.toISOString()).toBe(new Date('2026-07-15').toISOString());
  });
});

describe('clients.listClients — search', () => {
  test('busca por nombre (case-insensitive)', async () => {
    const org = await makeOrg();
    await makeClient(org.id, { rut: 'CLI-1', name: 'ACME Spa' });
    await makeClient(org.id, { rut: 'CLI-2', name: 'Otra Empresa' });
    const res = await clients.listClients({ organizationId: org.id, search: 'acme' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('ACME Spa');
  });

  test('busca por rut (case-insensitive)', async () => {
    const org = await makeOrg();
    await makeClient(org.id, { rut: 'ABC-123', name: 'Cliente Uno' });
    await makeClient(org.id, { rut: 'XYZ-999', name: 'Cliente Dos' });
    const res = await clients.listClients({ organizationId: org.id, search: 'abc-123' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].rut).toBe('ABC-123');
  });

  test('cada cliente listado trae sus stats calculados', async () => {
    const org = await makeOrg();
    const cli = await makeClient(org.id, { rut: 'CLI-1', name: 'ACME Spa' });
    await makeIncome(org.id, {
      clientId: cli.id,
      amount: 50000,
      status: 'PAID',
      paidDate: new Date('2026-07-02'),
    });
    const res = await clients.listClients({ organizationId: org.id } as never);
    expect(res).toHaveLength(1);
    expect(res[0].stats.collectedAmount).toBe(50000);
  });
});
