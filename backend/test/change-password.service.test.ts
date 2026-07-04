import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeUser } from './fixtures';
import { changePassword } from '../src/modules/auth/auth.service';
import { changePasswordSchema } from '../src/modules/auth/auth.schema';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { prisma } from '../src/lib/prisma';

describe('changePasswordSchema', () => {
  test('acepta newPassword de 8+ y currentPassword opcional', () => {
    expect(changePasswordSchema.parse({ newPassword: '12345678' })).toEqual({
      newPassword: '12345678',
    });
    expect(
      changePasswordSchema.parse({ currentPassword: 'x', newPassword: '12345678' }),
    ).toEqual({ currentPassword: 'x', newPassword: '12345678' });
  });

  test('rechaza newPassword de menos de 8', () => {
    expect(changePasswordSchema.safeParse({ newPassword: '1234567' }).success).toBe(false);
  });
});

beforeEach(resetDb);
afterAll(disconnect);

describe('changePassword — integración', () => {
  test('voluntario: con la actual correcta cambia la clave y limpia el flag', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    const res = await changePassword(user.id, {
      currentPassword: 'actual123',
      newPassword: 'nueva1234',
    });
    expect(res.mustChangePassword).toBe(false);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword('nueva1234', db!.passwordHash)).toBe(true);
  });

  test('voluntario: con la actual incorrecta => 401', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    await expect(
      changePassword(user.id, { currentPassword: 'mala', newPassword: 'nueva1234' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('voluntario: sin la actual => 401', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    await expect(
      changePassword(user.id, { newPassword: 'nueva1234' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('forzado: sin la actual cambia y limpia el flag', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('temporal1'),
      mustChangePassword: true,
    });
    const res = await changePassword(user.id, { newPassword: 'nueva1234' });
    expect(res.mustChangePassword).toBe(false);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword('nueva1234', db!.passwordHash)).toBe(true);
  });

  test('rechaza que la nueva sea igual a la actual => 400', async () => {
    const user = await makeUser({
      passwordHash: await hashPassword('actual123'),
      mustChangePassword: false,
    });
    await expect(
      changePassword(user.id, { currentPassword: 'actual123', newPassword: 'actual123' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
