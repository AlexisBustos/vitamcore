/**
 * Preparación de la base para PRODUCCIÓN (tras restaurar el dump local).
 *
 * - Fija la contraseña del usuario CEO desde la variable de entorno
 *   PROD_CEO_PASSWORD (hash bcrypt). No deja contraseñas de desarrollo.
 * - Elimina usuarios de demostración (p. ej. colaborador@vitam.tech).
 * - Verifica que el CEO exista y quede activo con rol CEO.
 *
 * Uso en el VPS (una sola vez, después del restore):
 *   PROD_CEO_EMAIL=a.bustos@vitam.tech PROD_CEO_PASSWORD='...' \
 *     npx tsx prisma/scripts/preparar-produccion.ts
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CEO_EMAIL = process.env.PROD_CEO_EMAIL ?? 'a.bustos@vitam.tech';
const CEO_PASSWORD = process.env.PROD_CEO_PASSWORD;

// Emails de cuentas demo/seed que NO deben existir en producción.
const DEMO_EMAILS = ['colaborador@vitam.tech'];

async function main() {
  if (!CEO_PASSWORD || CEO_PASSWORD.length < 8) {
    throw new Error(
      'Falta PROD_CEO_PASSWORD (mínimo 8 caracteres). Aborta sin cambios.',
    );
  }

  // 1) Fijar contraseña del CEO (crea el usuario si no existiera).
  const passwordHash = await bcrypt.hash(CEO_PASSWORD, 12);
  const ceo = await prisma.user.upsert({
    where: { email: CEO_EMAIL },
    update: { passwordHash, role: Role.CEO, isActive: true },
    create: {
      name: 'Alex Bustos',
      email: CEO_EMAIL,
      passwordHash,
      role: Role.CEO,
      isActive: true,
    },
  });

  // 2) Eliminar cuentas demo (sin tocar al CEO).
  const del = await prisma.user.deleteMany({
    where: { email: { in: DEMO_EMAILS }, NOT: { email: CEO_EMAIL } },
  });

  const total = await prisma.user.count();
  console.log('Preparación de producción completada.');
  console.log(`  CEO: ${ceo.email} (rol ${ceo.role}, activo=${ceo.isActive})`);
  console.log(`  Cuentas demo eliminadas: ${del.count}`);
  console.log(`  Usuarios totales: ${total}`);
}

main()
  .catch((err) => {
    console.error('Error preparando producción:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
