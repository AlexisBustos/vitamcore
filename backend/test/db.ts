import { prisma } from '../src/lib/prisma';

// Trunca todas las tablas del dominio en orden seguro (CASCADE resuelve FKs).
// Se llama en beforeEach para aislar cada test.
// Truncar "organizations" con CASCADE arrastra automáticamente a todas las
// tablas hijas (business_units, projects, tasks, labels, task_labels,
// checklist_items, task_comments, task_activity, sales_opportunities,
// clients, vendors, income_records, expense_records, bank_accounts,
// financial_import_batches, bank_transactions, documents,
// strategic_decisions), por lo que basta con listar las tablas raíz.
// task_comments/task_activity también cuelgan de "users" (autor/actor),
// que igualmente se trunca aquí.
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "users",
      "income_records", "expense_records", "clients", "vendors",
      "bank_transactions", "bank_accounts", "financial_import_batches",
      "organizations", "business_units", "projects"
    RESTART IDENTITY CASCADE
  `);
}

export async function disconnect() {
  await prisma.$disconnect();
}
