import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeVendor, makeExpense } from './fixtures';
import * as vendors from '../src/modules/vendors/vendors.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('vendors.getVendor — computeStats', () => {
  test('totalSpent excluye CANCELLED; paidAmount solo gastos con paidDate; pendingAmount = total - paid', async () => {
    const org = await makeOrg();
    const ven = await makeVendor(org.id, { rut: 'PROV-1', name: 'Proveedor Uno' });
    await makeExpense(org.id, { vendorId: ven.id, amount: 30000, status: 'PENDING', paidDate: null });
    await makeExpense(org.id, {
      vendorId: ven.id,
      amount: 20000,
      status: 'PAID',
      paidDate: new Date('2026-07-02'),
    });
    await makeExpense(org.id, {
      vendorId: ven.id,
      amount: 99999,
      status: 'CANCELLED',
      paidDate: null,
    });
    const detail = await vendors.getVendor(ven.id);
    expect(detail.stats.totalSpent).toBe(50000); // excluye el CANCELLED
    expect(detail.stats.paidAmount).toBe(20000);
    expect(detail.stats.pendingAmount).toBe(30000);
  });

  test('un gasto CANCELLED con paidDate también queda fuera de totalSpent y paidAmount', async () => {
    const org = await makeOrg();
    const ven = await makeVendor(org.id);
    await makeExpense(org.id, {
      vendorId: ven.id,
      amount: 100000,
      status: 'CANCELLED',
      paidDate: new Date('2026-07-02'),
    });
    const detail = await vendors.getVendor(ven.id);
    expect(detail.stats.totalSpent).toBe(0);
    expect(detail.stats.paidAmount).toBe(0);
    expect(detail.stats.pendingAmount).toBe(0);
  });

  test('documentCount cuenta solo los gastos no CANCELLED', async () => {
    const org = await makeOrg();
    const ven = await makeVendor(org.id);
    await makeExpense(org.id, { vendorId: ven.id, status: 'PENDING' });
    await makeExpense(org.id, { vendorId: ven.id, status: 'PAID', paidDate: new Date('2026-07-02') });
    await makeExpense(org.id, { vendorId: ven.id, status: 'CANCELLED' });
    const detail = await vendors.getVendor(ven.id);
    expect(detail.stats.documentCount).toBe(2);
  });

  test('lastDocumentDate usa sourceIssueDate o expenseDate como respaldo, el más reciente', async () => {
    const org = await makeOrg();
    const ven = await makeVendor(org.id);
    await makeExpense(org.id, { vendorId: ven.id, expenseDate: new Date('2026-05-01') });
    await makeExpense(org.id, { vendorId: ven.id, expenseDate: new Date('2026-07-20') });
    const detail = await vendors.getVendor(ven.id);
    expect(detail.stats.lastDocumentDate?.toISOString()).toBe(new Date('2026-07-20').toISOString());
  });
});

describe('vendors.listVendors — search', () => {
  test('busca por nombre (case-insensitive)', async () => {
    const org = await makeOrg();
    await makeVendor(org.id, { rut: 'PROV-1', name: 'Distribuidora Sur' });
    await makeVendor(org.id, { rut: 'PROV-2', name: 'Otro Proveedor' });
    const res = await vendors.listVendors({ organizationId: org.id, search: 'distribuidora' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Distribuidora Sur');
  });

  test('busca por rut (case-insensitive)', async () => {
    const org = await makeOrg();
    await makeVendor(org.id, { rut: 'ABC-123', name: 'Proveedor Uno' });
    await makeVendor(org.id, { rut: 'XYZ-999', name: 'Proveedor Dos' });
    const res = await vendors.listVendors({ organizationId: org.id, search: 'abc-123' } as never);
    expect(res).toHaveLength(1);
    expect(res[0].rut).toBe('ABC-123');
  });

  test('cada proveedor listado trae sus stats calculados', async () => {
    const org = await makeOrg();
    const ven = await makeVendor(org.id, { rut: 'PROV-1', name: 'Distribuidora Sur' });
    await makeExpense(org.id, { vendorId: ven.id, amount: 20000, status: 'PAID', paidDate: new Date('2026-07-02') });
    const res = await vendors.listVendors({ organizationId: org.id } as never);
    expect(res).toHaveLength(1);
    expect(res[0].stats.paidAmount).toBe(20000);
  });
});
