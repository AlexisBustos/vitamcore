/**
 * Renombra el email del usuario CEO de ceo@vitam.tech a a.bustos@vitam.tech.
 * Idempotente y seguro: si el destino ya existe o el origen no está, no toca
 * nada y explica por qué. Correr una vez por entorno (local y VPS):
 *   npx tsx scripts/fix-ceo-email.ts
 */
import { PrismaClient } from '@prisma/client';

const VIEJO = 'ceo@vitam.tech';
const NUEVO = 'a.bustos@vitam.tech';

const prisma = new PrismaClient();

async function main() {
  const yaNuevo = await prisma.user.findUnique({ where: { email: NUEVO } });
  if (yaNuevo) {
    console.log(`El usuario ${NUEVO} ya existe. Nada que hacer.`);
    return;
  }
  const viejo = await prisma.user.findUnique({ where: { email: VIEJO } });
  if (!viejo) {
    console.log(`No hay usuario con email ${VIEJO}. Nada que hacer.`);
    return;
  }
  await prisma.user.update({ where: { email: VIEJO }, data: { email: NUEVO } });
  console.log(`✅ Email del CEO actualizado: ${VIEJO} → ${NUEVO}`);
}

main()
  .catch((e) => {
    console.error('❌ Error corrigiendo el email del CEO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
