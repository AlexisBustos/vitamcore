import { prisma } from '../../src/lib/prisma';
import { categorize } from '../../src/modules/finance-imports/finance-imports.categories';

/// Reclasifica los movimientos NO ajustados a mano (categoryManual=false).
/// Idempotente y re-ejecutable: corre tras la migración y cada vez que se
/// afinen reglas, sin pisar las categorías corregidas manualmente.
async function main() {
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { id: true, description: true, chargeAmount: true },
  });
  let updated = 0;
  for (const t of txs) {
    const category = categorize(t.description, t.chargeAmount > 0);
    await prisma.bankTransaction.update({
      where: { id: t.id },
      data: { category },
    });
    updated += 1;
  }
  console.log(`Categorizados ${updated} movimientos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
