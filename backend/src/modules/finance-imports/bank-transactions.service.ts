import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { buildOwnAccounts, isInternalTransfer } from '../shared/internal-transfer';
import {
  listPeriods,
  periodSeries,
  periodRange,
  TRUNC,
  type Granularity,
} from '../shared/period';
import type { ListTransactionsFilters } from './finance-imports.schema';
import { refs } from './finance-imports.shared';

export async function listBankTransactions(filters: ListTransactionsFilters) {
  const where: Prisma.BankTransactionWhereInput = {
    organizationId: filters.organizationId,
    bankAccountId: filters.bankAccountId,
  };

  if (filters.period) {
    where.transactionDate = periodRange(filters.granularity, filters.period);
  }

  if (filters.category) {
    where.category = filters.category === '__none__' ? null : filters.category;
  }

  // Grupos de condiciones que usan `OR` internamente; se combinan vía `AND`
  // para no pisarse entre sí (búsqueda y "conciliado" son ambos OR).
  const and: Prisma.BankTransactionWhereInput[] = [];

  // Búsqueda: por la descripción cruda del banco (que NO trae el nombre de la
  // contraparte) o por el cliente/proveedor de la factura conciliada. Así
  // buscar "weir" encuentra su abono aunque el banco lo rotule genérico
  // ("Pago: Proveedores 0916…").
  if (filters.search) {
    const q = filters.search;
    and.push({
      OR: [
        { description: { contains: q, mode: 'insensitive' } },
        { paidIncomes: { some: { clientName: { contains: q, mode: 'insensitive' } } } },
        { paidExpenses: { some: { vendorName: { contains: q, mode: 'insensitive' } } } },
      ],
    });
  }

  // Conciliado = referenciado por alguna factura/gasto vía paidByBankTransactionId.
  if (filters.reconciliation === 'linked') {
    and.push({ OR: [{ paidIncomes: { some: {} } }, { paidExpenses: { some: {} } }] });
  } else if (filters.reconciliation === 'unlinked') {
    where.paidIncomes = { none: {} };
    where.paidExpenses = { none: {} };
  }

  if (and.length) where.AND = and;

  const [transactions, accounts] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
      include: {
        bankAccount: refs.bankAccount,
        paidIncomes: { select: { clientName: true } },
        paidExpenses: { select: { vendorName: true } },
      },
    }),
    prisma.bankAccount.findMany({
      where: filters.organizationId
        ? { organizationId: filters.organizationId }
        : {},
      select: { accountNumber: true },
    }),
  ]);
  const ownAccounts = buildOwnAccounts(accounts.map((a) => a.accountNumber));

  const totals = transactions.reduce(
    (acc, t) => {
      acc.charges += t.chargeAmount;
      acc.credits += t.creditAmount;
      return acc;
    },
    { charges: 0, credits: 0 },
  );

  const rows = transactions.map(({ paidIncomes, paidExpenses, ...t }) => {
    // Nombres de la(s) contraparte(s) enlazada(s): permiten mostrar y ubicar el
    // movimiento por cliente/proveedor aunque el banco no lo nombre.
    const counterparties = [
      ...new Set(
        [
          ...paidIncomes.map((i) => i.clientName),
          ...paidExpenses.map((e) => e.vendorName),
        ].filter((n): n is string => !!n && n.trim().length > 0),
      ),
    ];
    return {
      ...t,
      reconciled: paidIncomes.length > 0 || paidExpenses.length > 0,
      counterparties,
      internal: isInternalTransfer(t.description, ownAccounts),
    };
  });

  return {
    transactions: rows,
    totals: {
      count: rows.length,
      charges: totals.charges,
      credits: totals.credits,
      net: totals.credits - totals.charges,
      endingBalance: rows[0]?.balance ?? null,
      startingBalance: rows[rows.length - 1]?.balance ?? null,
    },
  };
}

async function assertCategoryKey(category: string | null) {
  if (category === null) return;
  const cat = await prisma.bankCategory.findUnique({
    where: { key: category },
    select: { key: true },
  });
  if (!cat) throw badRequest('La categoría indicada no existe');
}

export async function setCategoryBulk(ids: string[], category: string | null) {
  await assertCategoryKey(category);
  const result = await prisma.bankTransaction.updateMany({
    where: { id: { in: ids } },
    data: { category, categoryManual: true },
  });
  return { updated: result.count };
}

export async function setTransactionCategory(
  id: string,
  category: string | null,
) {
  await assertCategoryKey(category);
  const current = await prisma.bankTransaction.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) throw notFound('Movimiento no encontrado');
  return prisma.bankTransaction.update({
    where: { id },
    data: { category, categoryManual: true },
    include: { bankAccount: refs.bankAccount },
  });
}

export async function listBankTransactionPeriods(
  g: Granularity,
  filters: { organizationId?: string; bankAccountId?: string },
) {
  return listPeriods(g, { source: 'bank', ...filters });
}

export async function listBankPeriodic(
  g: Granularity,
  filters: {
    organizationId?: string;
    bankAccountId?: string;
  },
) {
  const conditions = [Prisma.sql`1 = 1`];
  if (filters.organizationId) {
    conditions.push(Prisma.sql`"organizationId" = ${filters.organizationId}`);
  }
  if (filters.bankAccountId) {
    conditions.push(Prisma.sql`"bankAccountId" = ${filters.bankAccountId}`);
  }
  const whereSql = Prisma.join(conditions, ' AND ');
  // Mismo truncador que listPeriods, para no discrepar en el borde de año. Van
  // por Prisma.raw (whitelist tipada TRUNC, no entrada de usuario) y NO como
  // parámetros: el DISTINCT ON exige que la expresión de truncado sea idéntica a
  // la del ORDER BY, y dos `${param}` serían $1 y $2, que Postgres no equipara.
  const { unit, format } = TRUNC[g];
  const trunc = Prisma.raw(`date_trunc('${unit}', "transactionDate")`);
  const periodo = Prisma.raw(
    `to_char(date_trunc('${unit}', "transactionDate"), '${format}')`,
  );

  // Flujos por cuenta y período.
  const flows = await prisma.$queryRaw<
    { bankAccountId: string; periodo: string; abonos: bigint; cargos: bigint }[]
  >(Prisma.sql`
    SELECT "bankAccountId",
           ${periodo} AS periodo,
           SUM("creditAmount")::bigint AS abonos,
           SUM("chargeAmount")::bigint AS cargos
    FROM "bank_transactions"
    WHERE ${whereSql}
    GROUP BY "bankAccountId", periodo
  `);

  if (flows.length === 0) return [];

  // Saldo de cierre por cuenta y período = balance del último movimiento.
  const closings = await prisma.$queryRaw<
    { bankAccountId: string; periodo: string; cierre: number | null }[]
  >(Prisma.sql`
    SELECT DISTINCT ON ("bankAccountId", ${trunc})
           "bankAccountId",
           ${periodo} AS periodo,
           "balance" AS cierre
    FROM "bank_transactions"
    WHERE ${whereSql}
    ORDER BY "bankAccountId", ${trunc},
             "transactionDate" DESC, "createdAt" DESC
  `);

  // Serie contigua [min..max] a partir de las claves devueltas (mismo grano).
  const allPeriods = [
    ...flows.map((f) => f.periodo),
    ...closings.map((c) => c.periodo),
  ];
  const minPeriod = allPeriods.reduce((a, b) => (a < b ? a : b));
  const maxPeriod = allPeriods.reduce((a, b) => (a > b ? a : b));
  const periods = periodSeries(g, minPeriod, maxPeriod);

  const accountIds = [
    ...new Set([
      ...flows.map((f) => f.bankAccountId),
      ...closings.map((c) => c.bankAccountId),
    ]),
  ];

  const key = (acc: string, periodo: string) => `${acc}|${periodo}`;
  const flowMap = new Map(flows.map((f) => [key(f.bankAccountId, f.periodo), f]));
  const closeMap = new Map(
    closings.map((c) => [key(c.bankAccountId, c.periodo), c.cierre]),
  );

  // Por cada cuenta: serie de cierre con carry-forward. Antes de su primer
  // movimiento aporta 0 (no se arrastra hacia atrás).
  const carried = new Map<string, Map<string, number>>();
  for (const acc of accountIds) {
    const series = new Map<string, number>();
    let last = 0;
    let started = false;
    for (const periodo of periods) {
      const own = closeMap.get(key(acc, periodo));
      if (own != null) {
        last = own;
        started = true;
      }
      series.set(periodo, started ? last : 0);
    }
    carried.set(acc, series);
  }

  // Consolidar por período y devolver más reciente primero.
  const result = periods.map((periodo) => {
    let closingBalance = 0;
    let credits = 0;
    let charges = 0;
    for (const acc of accountIds) {
      closingBalance += carried.get(acc)?.get(periodo) ?? 0;
      const f = flowMap.get(key(acc, periodo));
      if (f) {
        credits += Number(f.abonos);
        charges += Number(f.cargos);
      }
    }
    return {
      period: periodo,
      closingBalance,
      netFlow: credits - charges,
      credits,
      charges,
    };
  });

  return result.reverse();
}

export async function listBankByCategory(filters: {
  organizationId?: string;
  bankAccountId?: string;
  granularity: Granularity;
  period?: string;
}) {
  const conditions = [Prisma.sql`1 = 1`];
  if (filters.organizationId) {
    conditions.push(Prisma.sql`"organizationId" = ${filters.organizationId}`);
  }
  if (filters.bankAccountId) {
    conditions.push(Prisma.sql`"bankAccountId" = ${filters.bankAccountId}`);
  }
  if (filters.period) {
    const { gte, lt } = periodRange(filters.granularity, filters.period);
    conditions.push(
      Prisma.sql`"transactionDate" >= ${gte} AND "transactionDate" < ${lt}`,
    );
  }
  const rows = await prisma.$queryRaw<
    { category: string | null; credits: bigint; charges: bigint; count: bigint }[]
  >(Prisma.sql`
    SELECT category,
           SUM("creditAmount")::bigint AS credits,
           SUM("chargeAmount")::bigint AS charges,
           count(*)::bigint AS count
    FROM "bank_transactions"
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY category
  `);
  return rows.map((r) => ({
    category: r.category,
    credits: Number(r.credits),
    charges: Number(r.charges),
    count: Number(r.count),
  }));
}
