import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import { verifyPassword } from '../src/utils/password';
import * as users from '../src/modules/users/users.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('users.createUser', () => {
  test('crea con hash y sin exponer passwordHash', async () => {
    const u = await users.createUser({ name: 'Ana', email: 'ana@vitam.tech', role: 'COLABORADOR', password: 'secreta123' });
    expect(u).not.toHaveProperty('passwordHash');
    expect(u.role).toBe('COLABORADOR');
    const stored = await import('../src/lib/prisma').then((m) => m.prisma.user.findUnique({ where: { id: u.id } }));
    expect(stored!.passwordHash).not.toBe('secreta123');
    expect(await verifyPassword('secreta123', stored!.passwordHash)).toBe(true);
  });

  test('email duplicado => badRequest (400)', async () => {
    await users.createUser({ name: 'Ana', email: 'dup@vitam.tech', role: 'ADMIN', password: 'secreta123' });
    await expect(
      users.createUser({ name: 'Otra', email: 'dup@vitam.tech', role: 'ADMIN', password: 'secreta123' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('users.listUsers', () => {
  test('nunca devuelve passwordHash', async () => {
    await makeUser();
    const list = await users.listUsers();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('passwordHash');
  });
});

describe('users.updateUser — reglas de seguridad', () => {
  test('protege al CEO: no se puede desactivar', async () => {
    const ceo = await makeUser({ role: 'CEO', email: 'ceo@t.local' });
    const admin = await makeUser({ role: 'ADMIN', email: 'admin@t.local' });
    await expect(
      users.updateUser(ceo.id, { isActive: false }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('protege al CEO: no se puede degradar de rol', async () => {
    const ceo = await makeUser({ role: 'CEO', email: 'ceo2@t.local' });
    const admin = await makeUser({ role: 'ADMIN', email: 'admin2@t.local' });
    await expect(
      users.updateUser(ceo.id, { role: 'COLABORADOR' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('anti-auto-bloqueo: no puedes desactivarte a ti mismo', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'self@t.local' });
    await expect(
      users.updateUser(admin.id, { isActive: false }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('anti-auto-bloqueo: no puedes quitarte tu propio rol admin', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'self2@t.local' });
    await expect(
      users.updateUser(admin.id, { role: 'COLABORADOR' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('actualiza nombre/rol y resetea contraseña', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'a@t.local' });
    const target = await makeUser({ role: 'COLABORADOR', email: 'b@t.local' });
    const updated = await users.updateUser(target.id, { name: 'Beto', role: 'ADMIN', password: 'nuevaclave1' }, admin.id);
    expect(updated.name).toBe('Beto');
    expect(updated.role).toBe('ADMIN');
    const stored = await import('../src/lib/prisma').then((m) => m.prisma.user.findUnique({ where: { id: target.id } }));
    expect(await verifyPassword('nuevaclave1', stored!.passwordHash)).toBe(true);
  });

  test('desactiva un usuario (isActive=false)', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'a2@t.local' });
    const target = await makeUser({ role: 'COLABORADOR', email: 'c@t.local' });
    const updated = await users.updateUser(target.id, { isActive: false }, admin.id);
    expect(updated.isActive).toBe(false);
  });

  test('usuario inexistente => notFound (404)', async () => {
    const admin = await makeUser({ role: 'ADMIN', email: 'a3@t.local' });
    await expect(
      users.updateUser('no-existe', { name: 'X' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
