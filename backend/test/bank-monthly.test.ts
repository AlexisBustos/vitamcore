import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg, makeBankAccount, makeBankTransaction, makeImportBatch,
} from './fixtures';
import { listBankMonthly } from '../src/modules/finance-imports/bank-transactions.service';

// makeBankTransaction (fixtures.ts:77) recibe un OBJETO, no posicionales, y
// exige importBatchId: es FK obligatoria (schema.prisma:791) y no tiene default.
async function movimientosDe(organizationId: string) {
  const lote = await makeImportBatch(organizationId, { type: 'BANK_STATEMENT' });
  return (bankAccountId: string, overrides: Record<string, unknown> = {}) =>
    makeBankTransaction(
      { organizationId, bankAccountId, importBatchId: lote.id },
      overrides,
    );
}

describe('listBankMonthly', () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  test('sin movimientos devuelve vacío', async () => {
    const org = await makeOrg();
    expect(await listBankMonthly({ organizationId: org.id })).toEqual([]);
  });

  test('un mes: flujos y saldo de cierre', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 1000, chargeAmount: 0, balance: 1000,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-20'), creditAmount: 0, chargeAmount: 300, balance: 700,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res).toEqual([
      { month: '2026-07', closingBalance: 700, netFlow: 700, credits: 1000, charges: 300 },
    ]);
  });

  test('devuelve el más reciente primero', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-06-10'), creditAmount: 500, chargeAmount: 0, balance: 500,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-10'), creditAmount: 200, chargeAmount: 0, balance: 700,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res.map((r) => r.month)).toEqual(['2026-07', '2026-06']);
  });

  // El corazón del algoritmo: junio no tiene movimientos, pero su saldo de
  // cierre es el de mayo arrastrado. No es cero.
  test('carry-forward: un mes sin movimientos hereda el saldo anterior', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-05-10'), creditAmount: 900, chargeAmount: 0, balance: 900,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-10'), creditAmount: 100, chargeAmount: 0, balance: 1000,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res.map((r) => [r.month, r.closingBalance, r.netFlow])).toEqual([
      ['2026-07', 1000, 100],
      ['2026-06', 900, 0],   // ← heredado de mayo, sin movimientos propios
      ['2026-05', 900, 900],
    ]);
  });

  // La otra mitad de la regla (el flag `started`, bank-transactions.service.ts:241):
  // antes de su primer movimiento la cuenta aporta 0; el saldo NO se arrastra
  // hacia atrás.
  test('antes del primer movimiento de una cuenta, esa cuenta aporta 0', async () => {
    const org = await makeOrg();
    const vieja = await makeBankAccount(org.id, { accountNumber: '111' });
    const nueva = await makeBankAccount(org.id, { accountNumber: '222' });
    const mov = await movimientosDe(org.id);
    await mov(vieja.id, {
      transactionDate: new Date('2026-06-10'), creditAmount: 500, chargeAmount: 0, balance: 500,
    });
    await mov(nueva.id, {
      transactionDate: new Date('2026-07-10'), creditAmount: 300, chargeAmount: 0, balance: 300,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res.map((r) => [r.month, r.closingBalance])).toEqual([
      ['2026-07', 800],  // 500 (vieja, arrastrado) + 300 (nueva)
      ['2026-06', 500],  // la nueva aún no existe: aporta 0, no 300
    ]);
  });

  test('el saldo de cierre del mes es el del último movimiento, no la suma', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 1000, chargeAmount: 0, balance: 1000,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-25'), creditAmount: 0, chargeAmount: 250, balance: 750,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res[0].closingBalance).toBe(750);
  });

  test('filtra por cuenta', async () => {
    const org = await makeOrg();
    const a = await makeBankAccount(org.id, { accountNumber: '111' });
    const b = await makeBankAccount(org.id, { accountNumber: '222' });
    const mov = await movimientosDe(org.id);
    await mov(a.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 100, chargeAmount: 0, balance: 100,
    });
    await mov(b.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 900, chargeAmount: 0, balance: 900,
    });
    const res = await listBankMonthly({ bankAccountId: a.id });
    expect(res).toEqual([
      { month: '2026-07', closingBalance: 100, netFlow: 100, credits: 100, charges: 0 },
    ]);
  });
});
