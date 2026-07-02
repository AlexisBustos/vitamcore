import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

export async function makeOrg(name = 'Org Test', overrides: Record<string, unknown> = {}) {
  return prisma.organization.create({
    data: { name, type: 'TRANSVERSAL', ...overrides } as Prisma.OrganizationCreateInput,
  });
}

export async function makeIncome(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.incomeRecord.create({
    data: {
      organizationId,
      description: 'Ingreso test',
      amount: 100000,
      currency: 'CLP',
      status: 'INVOICED',
      incomeDate: new Date('2026-07-01'),
      ...overrides,
    } as Prisma.IncomeRecordUncheckedCreateInput,
  });
}

export async function makeExpense(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.expenseRecord.create({
    data: {
      organizationId,
      description: 'Gasto test',
      amount: 50000,
      currency: 'CLP',
      status: 'PENDING',
      expenseDate: new Date('2026-07-01'),
      ...overrides,
    } as Prisma.ExpenseRecordUncheckedCreateInput,
  });
}

export async function makeClient(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.client.create({
    data: { organizationId, rut: 'CLI-1', name: 'Cliente Test', ...overrides } as Prisma.ClientUncheckedCreateInput,
  });
}

export async function makeVendor(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.vendor.create({
    data: { organizationId, rut: 'PROV-1', name: 'Proveedor Test', ...overrides } as Prisma.VendorUncheckedCreateInput,
  });
}

export async function makeBankAccount(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.bankAccount.create({
    data: {
      organizationId,
      accountNumber: '000-111',
      name: 'Cuenta Test',
      bankName: 'Banco Test',
      ...overrides,
    } as Prisma.BankAccountUncheckedCreateInput,
  });
}

export async function makeImportBatch(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.financialImportBatch.create({
    data: {
      organizationId,
      type: 'PURCHASE_REPORT',
      status: 'PREVIEW',
      periodMonth: new Date('2026-07-01'),
      originalFileName: 'test.xlsx',
      fileSize: 1,
      sourceHash: 'hash-test',
      ...overrides,
    } as Prisma.FinancialImportBatchUncheckedCreateInput,
  });
}

export async function makeBankTransaction(
  args: { organizationId: string; bankAccountId: string; importBatchId: string },
  overrides: Record<string, unknown> = {},
) {
  return prisma.bankTransaction.create({
    data: {
      organizationId: args.organizationId,
      bankAccountId: args.bankAccountId,
      importBatchId: args.importBatchId,
      transactionDate: new Date('2026-07-02'),
      description: 'Movimiento test',
      dedupeKey: `mov-${Math.random().toString(36).slice(2)}`,
      ...overrides,
    } as Prisma.BankTransactionUncheckedCreateInput,
  });
}

export async function makeUser(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      name: 'Usuario Test',
      email: `user-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'hash-test',
      role: 'ADMIN',
      ...overrides,
    } as Prisma.UserUncheckedCreateInput,
  });
}
