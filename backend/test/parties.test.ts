import { beforeEach, afterAll, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg } from './fixtures';
import { prisma } from '../src/lib/prisma';
import * as parties from '../src/modules/shared/parties';

beforeEach(resetDb);
afterAll(disconnect);

// ---- resolveClientId ----

test('resolveClientId con nombre vacío/blanco retorna null y no crea cliente', async () => {
  const org = await makeOrg();

  expect(await parties.resolveClientId(org.id, '')).toBeNull();
  expect(await parties.resolveClientId(org.id, '   ')).toBeNull();
  expect(await parties.resolveClientId(org.id, null)).toBeNull();
  expect(await parties.resolveClientId(org.id, undefined)).toBeNull();

  const count = await prisma.client.count({ where: { organizationId: org.id } });
  expect(count).toBe(0);
});

test('resolveClientId con nombre nuevo crea un Client y retorna su id', async () => {
  const org = await makeOrg();

  const id = await parties.resolveClientId(org.id, 'ACME');
  expect(id).toBeTruthy();

  const created = await prisma.client.findUnique({ where: { id: id! } });
  expect(created).not.toBeNull();
  expect(created?.organizationId).toBe(org.id);
  expect(created?.name).toBe('ACME');
  // El rut provisional usa el nombre recortado.
  expect(created?.rut).toBe('ACME');
});

test('resolveClientId reutiliza por nombre case-insensitive y con espacios', async () => {
  const org = await makeOrg();

  const a = await parties.resolveClientId(org.id, 'ACME');
  const b = await parties.resolveClientId(org.id, '  acme ');
  const c = await parties.resolveClientId(org.id, 'AcMe');

  expect(a).toBeTruthy();
  expect(b).toBe(a);
  expect(c).toBe(a);

  const count = await prisma.client.count({ where: { organizationId: org.id } });
  expect(count).toBe(1);
});

// ---- resolveVendorId ----

test('resolveVendorId con nombre vacío/blanco retorna null y no crea proveedor', async () => {
  const org = await makeOrg();

  expect(await parties.resolveVendorId(org.id, '')).toBeNull();
  expect(await parties.resolveVendorId(org.id, '   ')).toBeNull();
  expect(await parties.resolveVendorId(org.id, null)).toBeNull();
  expect(await parties.resolveVendorId(org.id, undefined)).toBeNull();

  const count = await prisma.vendor.count({ where: { organizationId: org.id } });
  expect(count).toBe(0);
});

test('resolveVendorId con nombre nuevo crea un Vendor y retorna su id', async () => {
  const org = await makeOrg();

  const id = await parties.resolveVendorId(org.id, 'Proveedor XYZ');
  expect(id).toBeTruthy();

  const created = await prisma.vendor.findUnique({ where: { id: id! } });
  expect(created).not.toBeNull();
  expect(created?.organizationId).toBe(org.id);
  expect(created?.name).toBe('Proveedor XYZ');
  expect(created?.rut).toBe('Proveedor XYZ');
});

test('resolveVendorId reutiliza por nombre case-insensitive y con espacios', async () => {
  const org = await makeOrg();

  const a = await parties.resolveVendorId(org.id, 'Proveedor XYZ');
  const b = await parties.resolveVendorId(org.id, '  proveedor xyz ');
  const c = await parties.resolveVendorId(org.id, 'PROVEEDOR XYZ');

  expect(a).toBeTruthy();
  expect(b).toBe(a);
  expect(c).toBe(a);

  const count = await prisma.vendor.count({ where: { organizationId: org.id } });
  expect(count).toBe(1);
});
