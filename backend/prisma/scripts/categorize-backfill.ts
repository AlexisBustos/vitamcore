import { prisma } from '../../src/lib/prisma';
import { categorizeWith } from '../../src/modules/finance-imports/finance-imports.categories';
import { getActiveRules } from '../../src/modules/finance-categories/category-rules.service';

async function main() {
  const rules = await getActiveRules();
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { id: true, description: true, chargeAmount: true },
  });
  let updated = 0;
  for (const t of txs) {
    await prisma.bankTransaction.update({
      where: { id: t.id },
      data: { category: categorizeWith(rules, t.description, t.chargeAmount > 0) },
    });
    updated += 1;
  }
  console.log(`Categorizados ${updated} movimientos.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
