import { FinancialImportType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { assertOrganization } from '../shared/relations';
import type {
  CreateBankAccountInput,
  PreviewImportInput,
  UpdateBankAccountInput,
} from './finance-imports.schema';

export async function listBankAccounts(filters: { organizationId?: string }) {
  const accounts = await prisma.bankAccount.findMany({
    where: {
      organizationId: filters.organizationId,
      isActive: true,
    },
    orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
    include: { organization: { select: { id: true, name: true } } },
  });

  if (accounts.length === 0) return [];

  // Saldo actual = balance del último movimiento de cada cuenta (la cartola
  // trae saldo corrido, no se recalcula). Desempate por createdAt para
  // movimientos del mismo día (respeta el orden de filas de la cartola).
  const balances = await prisma.$queryRaw<
    {
      bankAccountId: string;
      currentBalance: number | null;
      lastMovementDate: Date | null;
      movementCount: bigint;
    }[]
  >(Prisma.sql`
    SELECT DISTINCT ON (t."bankAccountId")
      t."bankAccountId",
      t.balance AS "currentBalance",
      t."transactionDate" AS "lastMovementDate",
      count(*) OVER (PARTITION BY t."bankAccountId") AS "movementCount"
    FROM "bank_transactions" t
    WHERE t."bankAccountId" IN (${Prisma.join(accounts.map((a) => a.id))})
    ORDER BY t."bankAccountId", t."transactionDate" DESC, t."createdAt" DESC
  `);

  const byAccount = new Map(balances.map((b) => [b.bankAccountId, b]));
  return accounts.map((account) => {
    const stats = byAccount.get(account.id);
    return {
      ...account,
      currentBalance: stats?.currentBalance ?? null,
      lastMovementDate: stats?.lastMovementDate ?? null,
      movementCount: stats ? Number(stats.movementCount) : 0,
    };
  });
}

export async function createBankAccount(input: CreateBankAccountInput) {
  await assertOrganization(input.organizationId);
  try {
    return await prisma.bankAccount.create({
      data: input,
      include: { organization: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw badRequest('Ya existe una cuenta con ese número para la empresa');
    }
    throw error;
  }
}

export async function updateBankAccount(
  id: string,
  input: UpdateBankAccountInput,
) {
  const current = await prisma.bankAccount.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) throw notFound('Cuenta bancaria no encontrada');
  try {
    return await prisma.bankAccount.update({
      where: { id },
      data: input,
      include: { organization: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw badRequest('Ya existe una cuenta con ese número para la empresa');
    }
    throw error;
  }
}

export async function assertBankAccount(input: PreviewImportInput) {
  if (input.type !== FinancialImportType.BANK_STATEMENT) return null;
  if (!input.bankAccountId) {
    throw badRequest('Debes seleccionar una cuenta bancaria para la cartola');
  }

  const account = await prisma.bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { id: true, organizationId: true },
  });
  if (!account) throw notFound('Cuenta bancaria no encontrada');
  if (account.organizationId !== input.organizationId) {
    throw badRequest('La cuenta bancaria no pertenece a la empresa indicada');
  }
  return account.id;
}
