/**
 * Reestructuración inicial hacia datos REALES.
 *
 * - Elimina la data sintética del seed (proyectos, tareas, finanzas, ventas,
 *   documentos, decisiones, unidades de ejemplo, actividad del agente).
 * - Elimina la organización basura "Org Test".
 * - Conserva el usuario CEO, la configuración y las dos empresas reales
 *   (Vitam Healthcare, Vitam Tech).
 * - Crea/asegura las unidades de negocio REALES de cada empresa.
 *
 * Idempotente en las unidades (upsert por organizationId+name).
 * Ejecutar: cd backend && npx tsx prisma/scripts/reestructura-real.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Unidades reales por empresa (orden = orden de creación).
const HEALTHCARE_UNITS: { name: string; description?: string }[] = [
  { name: 'Centro Médico' },
  { name: 'Salud Ocupacional' },
  { name: 'Operativos Empresas' },
  { name: 'Programas Preventivos' },
  { name: 'Convenios' },
  { name: 'Programa Crónicos' },
  { name: 'Programa Obesidad' },
  { name: 'CIAS', description: 'Unidad de investigación' },
];

const TECH_UNITS: { name: string; description?: string }[] = [
  { name: 'Alox' },
  { name: 'Vine' },
  { name: 'Savi' },
  { name: 'Cronos' },
  { name: 'Gestor de Matrices de Riesgo' },
];

async function main() {
  // 1) Limpiar toda la data transaccional/sintética (preserva organizations,
  //    users, app_config y _prisma_migrations). CASCADE cubre FKs olvidadas.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "business_units", "projects", "tasks", "task_labels", "checklist_items",
      "task_comments", "task_activity", "labels",
      "sales_opportunities",
      "income_records", "expense_records", "clients", "vendors",
      "bank_accounts", "bank_transactions", "financial_import_batches",
      "bank_categories", "bank_category_rules",
      "documents", "strategic_decisions",
      "agent_conversations", "agent_messages", "agent_insights",
      "agent_proposed_tasks", "executive_reports"
    RESTART IDENTITY CASCADE
  `);

  // 2) Eliminar la organización basura "Org Test" (ya sin hijos).
  await prisma.organization.deleteMany({ where: { name: 'Org Test' } });

  // 3) Localizar las dos empresas reales.
  const healthcare = await prisma.organization.findUnique({
    where: { name: 'Vitam Healthcare' },
  });
  const tech = await prisma.organization.findUnique({
    where: { name: 'Vitam Tech' },
  });
  if (!healthcare || !tech) {
    throw new Error(
      'No se encontraron las empresas Vitam Healthcare / Vitam Tech. Aborta.',
    );
  }

  // 4) Crear/asegurar las unidades reales.
  async function ensureUnits(
    organizationId: string,
    units: { name: string; description?: string }[],
  ) {
    for (const u of units) {
      await prisma.businessUnit.upsert({
        where: { organizationId_name: { organizationId, name: u.name } },
        update: { description: u.description ?? null, status: 'ACTIVE' },
        create: { organizationId, name: u.name, description: u.description ?? null },
      });
    }
  }
  await ensureUnits(healthcare.id, HEALTHCARE_UNITS);
  await ensureUnits(tech.id, TECH_UNITS);

  // 5) Reporte.
  const [orgs, users, hUnits, tUnits, proj, tasks, income, expense, sales] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.businessUnit.count({ where: { organizationId: healthcare.id } }),
      prisma.businessUnit.count({ where: { organizationId: tech.id } }),
      prisma.project.count(),
      prisma.task.count(),
      prisma.incomeRecord.count(),
      prisma.expenseRecord.count(),
      prisma.salesOpportunity.count(),
    ]);

  console.log('Reestructuración completada.');
  console.log(`  Empresas: ${orgs} | Usuarios: ${users}`);
  console.log(`  Unidades Vitam Healthcare: ${hUnits} | Vitam Tech: ${tUnits}`);
  console.log(
    `  Data transaccional (debe ser 0): proyectos=${proj} tareas=${tasks} ingresos=${income} gastos=${expense} ventas=${sales}`,
  );
}

main()
  .catch((err) => {
    console.error('Error en la reestructuración:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
