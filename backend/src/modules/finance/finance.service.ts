/**
 * Resumen financiero ejecutivo (ingresos + gastos).
 * Reutilizado por la página Finanzas y por el dashboard.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { currentMonthRange } from '../shared/dates';
import { buildOwnAccounts, isInternalTransfer } from '../shared/internal-transfer';
import {
  computeReceivablePayable,
  computeOverdue,
  INCOME_PENDING,
  EXPENSE_PENDING,
} from './finance-shared';

export async function getSummary(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};
  const { start, end } = currentMonthRange();
  const now = new Date();

  const [
    monthIncome,
    monthExpense,
    recurringIncome,
    recurringExpense,
    incomeByCategory,
    expenseByCategory,
    incomeByOrg,
    expenseByOrg,
    upcomingIncome,
    upcomingExpense,
    collectedIncome,
    recPay,
    overdue,
  ] = await Promise.all([
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        incomeDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: {
        ...orgFilter,
        expenseDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: { ...orgFilter, isRecurring: true, status: { not: 'CANCELLED' } },
    }),
    prisma.incomeRecord.groupBy({
      by: ['category'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ['category'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.incomeRecord.groupBy({
      by: ['organizationId'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ['organizationId'],
      where: { ...orgFilter, status: { not: 'CANCELLED' } },
      _sum: { amount: true },
    }),
    prisma.incomeRecord.findMany({
      where: {
        ...orgFilter,
        documentKind: { not: 'CREDIT_NOTE' },
        dueDate: { gte: now },
        status: { in: INCOME_PENDING },
      },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true, description: true, amount: true, currency: true,
        dueDate: true, status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.expenseRecord.findMany({
      where: { ...orgFilter, dueDate: { gte: now }, status: { in: EXPENSE_PENDING } },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true, description: true, amount: true, currency: true,
        dueDate: true, status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.incomeRecord.aggregate({
      _sum: { netAmount: true },
      where: { ...orgFilter, status: { not: 'CANCELLED' }, paidDate: { not: null } },
    }),
    computeReceivablePayable(organizationId),
    computeOverdue(organizationId),
  ]);

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;

  const monthIncomeTotal = monthIncome._sum.amount ?? 0;
  const monthExpenseTotal = monthExpense._sum.amount ?? 0;

  const byOrgMap = new Map<string, { income: number; expense: number }>();
  for (const r of incomeByOrg) {
    byOrgMap.set(r.organizationId, { income: r._sum.amount ?? 0, expense: 0 });
  }
  for (const r of expenseByOrg) {
    const cur = byOrgMap.get(r.organizationId) ?? { income: 0, expense: 0 };
    cur.expense = r._sum.amount ?? 0;
    byOrgMap.set(r.organizationId, cur);
  }

  const upcomingFinancial = [
    ...upcomingIncome.map((i) => ({ ...i, kind: 'INCOME' as const })),
    ...upcomingExpense.map((e) => ({ ...e, kind: 'EXPENSE' as const })),
  ]
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 8);

  return {
    monthIncome: monthIncomeTotal,
    monthExpense: monthExpenseTotal,
    estimatedResult: monthIncomeTotal - monthExpenseTotal,
    pendingIncome: recPay.receivable,
    collectedIncome: collectedIncome._sum.netAmount ?? 0,
    pendingExpense: recPay.payable,
    recurringIncome: recurringIncome._sum.amount ?? 0,
    recurringExpense: recurringExpense._sum.amount ?? 0,
    overdueIncome: overdue.overdueReceivable,
    overdueExpense: overdue.overduePayable,
    incomeByCategory: incomeByCategory.map((c) => ({
      category: c.category ?? 'Sin categoría',
      amount: c._sum.amount ?? 0,
    })),
    expenseByCategory: expenseByCategory.map((c) => ({
      category: c.category ?? 'Sin categoría',
      amount: c._sum.amount ?? 0,
    })),
    byOrganization: Array.from(byOrgMap.entries()).map(([id, v]) => ({
      id,
      name: orgName(id),
      income: v.income,
      expense: v.expense,
      result: v.income - v.expense,
    })),
    upcomingFinancial,
  };
}

/**
 * Cuadre del mes (o de todos): abonos/cargos con total · conciliado · suelto,
 * derivado de la relación inversa paidIncomes/paidExpenses (no se persiste).
 */
export async function getReconciliationSummary(filters: {
  organizationId?: string;
  month?: string;
}) {
  const where: Prisma.BankTransactionWhereInput = {};
  if (filters.organizationId) where.organizationId = filters.organizationId;
  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    where.transactionDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  // Cuentas propias para detectar traspasos internos (no son ingreso/gasto).
  const accounts = await prisma.bankAccount.findMany({
    where: filters.organizationId
      ? { organizationId: filters.organizationId }
      : {},
    select: { accountNumber: true },
  });
  const ownAccounts = buildOwnAccounts(accounts.map((a) => a.accountNumber));

  const rows = await prisma.bankTransaction.findMany({
    where,
    select: {
      creditAmount: true,
      chargeAmount: true,
      description: true,
      _count: { select: { paidIncomes: true, paidExpenses: true } },
    },
  });

  const credits = { total: 0, conciliado: 0, suelto: 0 };
  const charges = { total: 0, conciliado: 0, suelto: 0 };
  let unlinkedCount = 0;
  const internal = { count: 0, amount: 0 };

  for (const r of rows) {
    // Los traspasos internos se excluyen del cuadre (no son suelto ni total).
    if (isInternalTransfer(r.description, ownAccounts)) {
      internal.count += 1;
      internal.amount += r.creditAmount + r.chargeAmount;
      continue;
    }
    const linkedIncome = r._count.paidIncomes > 0;
    const linkedExpense = r._count.paidExpenses > 0;
    if (r.creditAmount > 0) {
      credits.total += r.creditAmount;
      if (linkedIncome) credits.conciliado += r.creditAmount;
    }
    if (r.chargeAmount > 0) {
      charges.total += r.chargeAmount;
      if (linkedExpense) charges.conciliado += r.chargeAmount;
    }
    if (!linkedIncome && !linkedExpense) unlinkedCount += 1;
  }
  credits.suelto = credits.total - credits.conciliado;
  charges.suelto = charges.total - charges.conciliado;

  return { credits, charges, unlinkedCount, internal };
}

/**
 * Posición consolidada (foto al día) + cuadre del mes. Reemplaza a
 * getFinancePosition. La posición ignora `month`; solo `reconciliation` lo usa.
 */
export async function getConsolidated(filters: {
  organizationId?: string;
  month?: string;
}) {
  const { organizationId, month } = filters;

  const [cashRows, recPay, overdue, orgs, reconciliation] = await Promise.all([
    prisma.$queryRaw<{ organizationId: string; caja: bigint }[]>(Prisma.sql`
      SELECT ba."organizationId", COALESCE(SUM(last.balance), 0)::bigint AS caja
      FROM "bank_accounts" ba
      LEFT JOIN LATERAL (
        SELECT t.balance FROM "bank_transactions" t
        WHERE t."bankAccountId" = ba.id
        ORDER BY t."transactionDate" DESC, t."createdAt" DESC
        LIMIT 1
      ) last ON true
      WHERE ba."isActive" = true ${
        organizationId
          ? Prisma.sql`AND ba."organizationId" = ${organizationId}`
          : Prisma.empty
      }
      GROUP BY ba."organizationId"
    `),
    computeReceivablePayable(organizationId),
    computeOverdue(organizationId),
    prisma.organization.findMany({ select: { id: true, name: true } }),
    getReconciliationSummary({ organizationId, month }),
  ]);

  const cashByOrg = new Map<string, number>();
  for (const r of cashRows) cashByOrg.set(r.organizationId, Number(r.caja));

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const ids = new Set<string>([...cashByOrg.keys(), ...recPay.byOrg.keys()]);

  const byOrganization = [...ids]
    .map((id) => {
      const cash = cashByOrg.get(id) ?? 0;
      const rp = recPay.byOrg.get(id) ?? { receivable: 0, payable: 0 };
      return {
        organizationId: id,
        name: orgName(id),
        cash,
        receivable: rp.receivable,
        payable: rp.payable,
        position: cash + rp.receivable - rp.payable,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cash = byOrganization.reduce((s, o) => s + o.cash, 0);

  return {
    cash,
    receivable: recPay.receivable,
    payable: recPay.payable,
    position: cash + recPay.receivable - recPay.payable,
    overdueReceivable: overdue.overdueReceivable,
    overduePayable: overdue.overduePayable,
    byOrganization,
    reconciliation,
  };
}

// ----- Auto-conciliación conservadora (solo pares de monto único) -----

type AutoCandidate = {
  id: string;
  target: number;
  date: Date | null;
  counterpart: string;
  document: string;
};
type AutoMov = {
  id: string;
  amount: number;
  date: Date;
  description: string;
  documentNumber: string | null;
};

/** Etiqueta legible del documento (p. ej. "Factura 1234"), con fallback. */
function docLabel(
  type: string | null | undefined,
  folio: string | null | undefined,
  fallback: string,
): string {
  const label = [type?.trim(), folio?.trim()].filter(Boolean).join(' ');
  return label || fallback;
}

/**
 * Empareja facturas con movimientos solo cuando para un monto hay exactamente
 * UNA factura y UN movimiento, y el movimiento cae dentro de la ventana de fecha.
 * Si hay más de uno de cualquier lado, el monto es ambiguo y no se toca.
 */
function pairUp(invoices: AutoCandidate[], movs: AutoMov[], windowMs: number) {
  const invByAmount = new Map<number, AutoCandidate[]>();
  for (const inv of invoices) {
    const arr = invByAmount.get(inv.target) ?? [];
    arr.push(inv);
    invByAmount.set(inv.target, arr);
  }
  const movByAmount = new Map<number, AutoMov[]>();
  for (const mv of movs) {
    const arr = movByAmount.get(mv.amount) ?? [];
    arr.push(mv);
    movByAmount.set(mv.amount, arr);
  }

  const pairs: { invoiceId: string; movId: string; movDate: Date }[] = [];
  let ambiguousAmounts = 0;
  for (const [amount, invs] of invByAmount) {
    const ms = movByAmount.get(amount);
    if (!ms) continue; // factura sin movimiento del mismo monto: no es ambiguo
    if (invs.length === 1 && ms.length === 1) {
      const inv = invs[0];
      const mv = ms[0];
      // Requiere fecha de factura para validar la ventana; sin ella, va a manual.
      if (inv.date && Math.abs(mv.date.getTime() - inv.date.getTime()) <= windowMs) {
        pairs.push({ invoiceId: inv.id, movId: mv.id, movDate: mv.date });
      }
    } else {
      ambiguousAmounts += 1;
    }
  }
  return { pairs, ambiguousAmounts };
}

/**
 * Auto-concilia los pares inequívocos de una empresa. preview (apply:false) no
 * escribe; aplicar (apply:true) setea paidByBankTransactionId/paidDate/status=PAID
 * reusando la misma escritura que registerPayment. Idempotente.
 */
export async function autoReconcile(input: {
  organizationId: string;
  month?: string;
  apply: boolean;
  selection?: { invoiceId: string; movId: string }[];
}) {
  const { organizationId, month, apply, selection } = input;
  const WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // ±60 días

  let range: { gte: Date; lt: Date } | null = null;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    range = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  const inRange = (d: Date | null) =>
    !range || (d != null && d >= range.gte && d < range.lt);

  const [incomes, creditMovs, expenses, chargeMovs] = await Promise.all([
    prisma.incomeRecord.findMany({
      where: {
        organizationId,
        documentKind: { not: 'CREDIT_NOTE' },
        status: { not: 'CANCELLED' },
        paidDate: null,
        netAmount: { gt: 0 },
      },
      select: {
        id: true, amount: true, netAmount: true,
        sourceIssueDate: true, incomeDate: true, dueDate: true,
        clientName: true, sourceRut: true, description: true,
        sourceDocumentType: true, sourceFolio: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: { organizationId, creditAmount: { gt: 0 }, paidIncomes: { none: {} } },
      select: {
        id: true, creditAmount: true, transactionDate: true,
        description: true, documentNumber: true,
      },
    }),
    prisma.expenseRecord.findMany({
      where: { organizationId, status: { not: 'CANCELLED' }, paidDate: null },
      select: {
        id: true, amount: true,
        sourceIssueDate: true, expenseDate: true, dueDate: true,
        vendorName: true, sourceRut: true, description: true,
        sourceDocumentType: true, sourceFolio: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: { organizationId, chargeAmount: { gt: 0 }, paidExpenses: { none: {} } },
      select: {
        id: true, chargeAmount: true, transactionDate: true,
        description: true, documentNumber: true,
      },
    }),
  ]);

  const incomeCands: AutoCandidate[] = incomes
    .map((r) => ({
      id: r.id,
      target: r.netAmount ?? r.amount,
      date: r.sourceIssueDate ?? r.incomeDate ?? r.dueDate,
      counterpart: r.clientName ?? r.sourceRut ?? '—',
      document: docLabel(r.sourceDocumentType, r.sourceFolio, r.description),
    }))
    .filter((c) => inRange(c.date));
  const expenseCands: AutoCandidate[] = expenses
    .map((r) => ({
      id: r.id,
      target: r.amount,
      date: r.sourceIssueDate ?? r.expenseDate ?? r.dueDate,
      counterpart: r.vendorName ?? r.sourceRut ?? '—',
      document: docLabel(r.sourceDocumentType, r.sourceFolio, r.description),
    }))
    .filter((c) => inRange(c.date));

  const incomeMovs: AutoMov[] = creditMovs.map((t) => ({
    id: t.id, amount: t.creditAmount, date: t.transactionDate,
    description: t.description, documentNumber: t.documentNumber,
  }));
  const expenseMovs: AutoMov[] = chargeMovs.map((t) => ({
    id: t.id, amount: t.chargeAmount, date: t.transactionDate,
    description: t.description, documentNumber: t.documentNumber,
  }));

  const inc = pairUp(incomeCands, incomeMovs, WINDOW_MS);
  const exp = pairUp(expenseCands, expenseMovs, WINDOW_MS);

  // Al aplicar con una selección explícita, solo se escriben los pares elegidos.
  // El preview (apply:false) o el apply sin selección usan todos los detectados.
  const selectedKeys = selection
    ? new Set(selection.map((s) => `${s.invoiceId}:${s.movId}`))
    : null;
  const pickApply = (pairs: { invoiceId: string; movId: string; movDate: Date }[]) =>
    apply && selectedKeys
      ? pairs.filter((p) => selectedKeys.has(`${p.invoiceId}:${p.movId}`))
      : pairs;
  const incPairs = pickApply(inc.pairs);
  const expPairs = pickApply(exp.pairs);

  if (apply && (incPairs.length > 0 || expPairs.length > 0)) {
    await prisma.$transaction([
      ...incPairs.map((p) =>
        prisma.incomeRecord.update({
          where: { id: p.invoiceId },
          data: {
            paidByBankTransactionId: p.movId,
            paidDate: p.movDate,
            status: 'PAID',
          },
        }),
      ),
      ...expPairs.map((p) =>
        prisma.expenseRecord.update({
          where: { id: p.invoiceId },
          data: {
            paidByBankTransactionId: p.movId,
            paidDate: p.movDate,
            status: 'PAID',
          },
        }),
      ),
    ]);
  }

  // Detalle legible de cada par para que el usuario lo revise antes de aplicar.
  const incById = new Map(incomeCands.map((c) => [c.id, c]));
  const incMovById = new Map(incomeMovs.map((m) => [m.id, m]));
  const expById = new Map(expenseCands.map((c) => [c.id, c]));
  const expMovById = new Map(expenseMovs.map((m) => [m.id, m]));

  const detail = (
    kind: 'income' | 'expense',
    pairs: { invoiceId: string; movId: string }[],
    invMap: Map<string, AutoCandidate>,
    movMap: Map<string, AutoMov>,
  ) =>
    pairs.map((p) => {
      const c = invMap.get(p.invoiceId)!;
      const m = movMap.get(p.movId)!;
      return {
        kind,
        invoiceId: p.invoiceId,
        movId: p.movId,
        amount: c.target,
        counterpart: c.counterpart,
        document: c.document,
        invoiceDate: c.date,
        movementDescription: m.description,
        movementDocumentNumber: m.documentNumber,
        movementDate: m.date,
      };
    });

  const details = [
    ...detail('income', incPairs, incById, incMovById),
    ...detail('expense', expPairs, expById, expMovById),
  ];

  return {
    pairs: incPairs.length + expPairs.length,
    linkedIncome: incPairs.length,
    linkedExpense: expPairs.length,
    ambiguousAmounts: inc.ambiguousAmounts + exp.ambiguousAmounts,
    details,
  };
}

// ----- Reconocer transferencias a/desde terceros como gastos/ingresos -----

// Pagos a terceros llegan como "Traspaso A: <nombre>"; cobros como
// "Traspaso De: <nombre>". Los internos son "Traspaso A/De Cuenta: <nº>" y no
// calzan estos prefijos (el ":" va justo tras "A"/"De").
const TRANSFER_OUT_PREFIX = 'Traspaso A:'; // pago → gasto
const TRANSFER_IN_PREFIX = 'Traspaso De:'; // cobro → ingreso

/** Extrae el destinatario/pagador de la descripción del movimiento. */
function transferPayee(description: string): string {
  return description.replace(/^\s*traspaso (a|de):\s*/i, '').trim() || 'Sin nombre';
}

/**
 * Reconoce transferencias sin factura como gastos/ingresos pagados, atribuidos
 * al tercero. direction 'expense' = "Traspaso A:" (crea ExpenseRecord con
 * vendorName); 'income' = "Traspaso De:" (crea IncomeRecord con clientName).
 * preview (apply:false) no escribe; aplicar crea el registro por movimiento y lo
 * deja conciliado (paidByBankTransactionId + status PAID). selection acota cuáles.
 */
export async function recognizeTransfers(input: {
  organizationId: string;
  month?: string;
  direction: 'expense' | 'income';
  category: string;
  apply: boolean;
  selection?: string[];
}) {
  const { organizationId, month, direction, category, apply, selection } = input;
  const isIncome = direction === 'income';

  const where: Prisma.BankTransactionWhereInput = {
    organizationId,
    description: {
      startsWith: isIncome ? TRANSFER_IN_PREFIX : TRANSFER_OUT_PREFIX,
      mode: 'insensitive',
    },
    ...(isIncome
      ? { creditAmount: { gt: 0 }, paidIncomes: { none: {} } }
      : { chargeAmount: { gt: 0 }, paidExpenses: { none: {} } }),
  };
  if (month) {
    const [y, m] = month.split('-').map(Number);
    where.transactionDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  const movs = await prisma.bankTransaction.findMany({
    where,
    select: {
      id: true,
      creditAmount: true,
      chargeAmount: true,
      transactionDate: true,
      description: true,
      currency: true,
    },
    orderBy: { transactionDate: 'asc' },
  });

  const amountOf = (m: { creditAmount: number; chargeAmount: number }) =>
    isIncome ? m.creditAmount : m.chargeAmount;

  const selectedSet = selection ? new Set(selection) : null;
  const chosen =
    apply && selectedSet ? movs.filter((m) => selectedSet.has(m.id)) : movs;

  if (apply && chosen.length > 0) {
    await prisma.$transaction(
      chosen.map((m) => {
        const payee = transferPayee(m.description);
        const amount = amountOf(m);
        return isIncome
          ? prisma.incomeRecord.create({
              data: {
                organizationId,
                clientName: payee,
                description: `Cobro de ${payee}`,
                amount,
                netAmount: amount,
                currency: m.currency,
                category,
                status: 'PAID',
                incomeDate: m.transactionDate,
                paidDate: m.transactionDate,
                paidByBankTransactionId: m.id,
              },
            })
          : prisma.expenseRecord.create({
              data: {
                organizationId,
                vendorName: payee,
                description: `Pago a ${payee}`,
                amount,
                currency: m.currency,
                category,
                status: 'PAID',
                expenseDate: m.transactionDate,
                paidDate: m.transactionDate,
                paidByBankTransactionId: m.id,
              },
            });
      }),
    );
  }

  const details = chosen.map((m) => ({
    movId: m.id,
    payee: transferPayee(m.description),
    amount: amountOf(m),
    date: m.transactionDate,
    description: m.description,
  }));

  return {
    count: details.length,
    created: apply ? chosen.length : 0,
    totalAmount: details.reduce((s, d) => s + d.amount, 0),
    details,
  };
}
