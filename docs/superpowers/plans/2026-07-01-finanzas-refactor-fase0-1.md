# Refactor Finanzas — Fase 0 (red de tests) + Fase 1 (extracción compartida backend) — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar una red de tests de backend (Vitest + BD de test real) que capture el comportamiento actual del dominio Finanzas y, con esa red verde, extraer la lógica duplicada de income/expenses y clients/vendors a helpers compartidos sin cambiar el comportamiento.

**Architecture:** Vitest corre contra una BD Postgres `vitamcore_test` real (el mismo contenedor Docker), con reset por truncado entre tests. Los tests de caracterización congelan el comportamiento de los services; luego se refactoriza extrayendo `shared/ledger.ts` (helpers de ingresos/gastos) y unificando `shared/parties.ts` (`resolveParty`), manteniendo income/expenses/clients/vendors como services delgados. La suite se corre sin modificar tras cada extracción para garantizar cero cambio de comportamiento.

**Tech Stack:** Node + TypeScript (CommonJS), Prisma 5, Express, Vitest 2, Postgres 16 (Docker). Spec: `docs/superpowers/specs/2026-07-01-finanzas-refactor-design.md`.

**Rama:** `refactor/finanzas` (crear desde `develop` antes de empezar).

**Convención de commits:** terminar cada mensaje con
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Mapa de archivos (Fase 0 + Fase 1)

**Se crean:**
- `backend/vitest.config.ts` — configuración de Vitest (entorno node, setupFiles).
- `backend/.env.test` — variables de entorno para la BD de test (NO se commitea si contiene secretos; ver Task 0.1).
- `backend/test/setup-env.ts` — carga `.env.test` con override antes de importar módulos.
- `backend/test/db.ts` — helper `resetDb()` (truncado) y `disconnect()`.
- `backend/test/fixtures.ts` — factories mínimas (org, income, expense, client, vendor, bank account, import batch, bank transaction).
- `backend/test/income.service.test.ts`
- `backend/test/expenses.service.test.ts`
- `backend/test/clients.service.test.ts`
- `backend/test/vendors.service.test.ts`
- `backend/test/parties.test.ts`
- `backend/test/finance.service.test.ts`
- `backend/test/finance-imports.service.test.ts`
- `backend/test/ledger.test.ts` (Fase 1)
- `backend/src/modules/shared/ledger.ts` (Fase 1)
- `backend/scripts/test-db-setup.sh` — crea la BD de test y aplica migraciones.

**Se modifican:**
- `backend/package.json` — devDeps `vitest`, scripts `test`, `test:watch`, `test:db:setup`.
- `backend/src/modules/income/income.service.ts` — usar `shared/ledger`.
- `backend/src/modules/expenses/expenses.service.ts` — usar `shared/ledger`.
- `backend/src/modules/shared/parties.ts` — colapsar a `resolveParty`.
- `backend/src/modules/finance-imports/finance-imports.service.ts` — reemplazar `upsertClient`/`upsertVendor` por `resolveParty`.
- `backend/src/modules/clients/clients.service.ts` — usar `listParties`/`getParty` (extracción común).
- `backend/src/modules/vendors/vendors.service.ts` — idem.

---

## Chunk 1: Fase 0 — Red de tests

### Task 0.1: Instalar Vitest y configurar el entorno de test

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.test`
- Create: `backend/test/setup-env.ts`
- Create: `backend/scripts/test-db-setup.mjs`

- [ ] **Step 1: Instalar Vitest**

Run (desde `backend/`):
```bash
npm install -D vitest@^2
```
Expected: `vitest` aparece en `devDependencies`. (No hace falta `dotenv-cli`: el entorno lo carga `setup-env.ts`.)

- [ ] **Step 2: Añadir scripts a `package.json`**

En `backend/package.json`, dentro de `"scripts"`, añadir:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:db:setup": "node scripts/test-db-setup.mjs"
```

- [ ] **Step 3: Crear `.env.test`**

`backend/.env.test` (usa la MISMA forma que `.env`, pero apunta a `vitamcore_test`):
```
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vitamcore_test
JWT_SECRET=test-secret-please-change-32chars-minimum-000
CORS_ORIGIN=http://localhost:5173
AGENT_PROVIDER=heuristic
```
Nota: `JWT_SECRET` debe tener ≥32 caracteres (lo valida `config/env.ts`).

- [ ] **Step 4: Crear el script de setup de la BD de test (Node, portable en Windows)**

`backend/scripts/test-db-setup.mjs`:
```js
import { execSync } from 'node:child_process';

const TEST_DB = 'vitamcore_test';
const TEST_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB}`;

// 1) Crear la BD de test si no existe (idempotente).
const exists = execSync(
  `docker exec vitamcore-postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'"`,
).toString();
if (!exists.includes('1')) {
  execSync(`docker exec vitamcore-postgres psql -U postgres -c "CREATE DATABASE ${TEST_DB}"`, {
    stdio: 'inherit',
  });
}

// 2) Aplicar todas las migraciones a la BD de test.
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: TEST_URL },
});
console.log('BD de test lista.');
```
Nota: usa `node` (no `bash`) para funcionar en Windows sin depender de Git Bash en el PATH de `npm`.

- [ ] **Step 5: Crear el cargador de entorno de test**

`backend/test/setup-env.ts` (se ejecuta antes de cada archivo de test, ANTES de importar cualquier módulo que lea `process.env`):
```ts
import { config } from 'dotenv';
// override:true para que .env.test gane sobre cualquier .env ya cargado.
config({ path: '.env.test', override: true });
```

- [ ] **Step 6: Crear `vitest.config.ts`**

`backend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    // Los tests comparten una BD real: evitar concurrencia entre archivos.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
```
**Linchpin del orden de carga (no romper):** `config/env.ts` llama a `dotenv.config()` **sin** `override`, así que el `override:true` de `setup-env.ts` —que Vitest ejecuta ANTES del archivo de test vía `setupFiles`— gana y sobrevive. Además `lib/prisma.ts` lee `process.env.DATABASE_URL` al construir el singleton, por lo que ningún test puede importar módulos de `src/` antes de que corra `setup-env.ts` (Vitest lo garantiza). No importes servicios en el nivel superior del `setup-env.ts`.

- [ ] **Step 7: Preparar la BD de test**

Run (con Docker Postgres ya arriba):
```bash
npm run test:db:setup
```
Expected: "BD de test lista." y las migraciones aplicadas sin error.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/vitest.config.ts backend/.env.test backend/test/setup-env.ts backend/scripts/test-db-setup.mjs
git commit -m "test: instalar Vitest + BD de test para el backend"
```
Nota: si `.env.test` no debe versionarse por política, añadirlo a `.gitignore` y crear `.env.test.example` en su lugar.

---

### Task 0.2: Helper de reset de BD y factories de fixtures

**Files:**
- Create: `backend/test/db.ts`
- Create: `backend/test/fixtures.ts`

- [ ] **Step 1: Crear `test/db.ts`**

`backend/test/db.ts`:
```ts
import { prisma } from '../src/lib/prisma';

// Trunca todas las tablas del dominio en orden seguro (CASCADE resuelve FKs).
// Se llama en beforeEach para aislar cada test.
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "income_records", "expense_records", "clients", "vendors",
      "bank_transactions", "bank_accounts", "financial_import_batches",
      "organizations", "business_units", "projects"
    RESTART IDENTITY CASCADE
  `);
}

export async function disconnect() {
  await prisma.$disconnect();
}
```
Nota: verificar los nombres `@@map` reales en `schema.prisma` (p. ej. `income_records`, `expense_records`, `clients`, `vendors`, `bank_transactions`, `bank_accounts`). Ajustar la lista a las tablas existentes; añadir cualquier tabla con FK a organizations que impida el truncado.

- [ ] **Step 2: Crear `test/fixtures.ts`**

`backend/test/fixtures.ts` (factories mínimas; solo campos obligatorios + los que el test necesite):
```ts
import { prisma } from '../src/lib/prisma';

export async function makeOrg(name = 'Org Test') {
  return prisma.organization.create({ data: { name } });
}

export async function makeIncome(
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.incomeRecord.create({
    data: {
      organizationId,
      description: 'Ingreso test',
      amount: 100000,
      currency: 'CLP',
      status: 'INVOICED',
      incomeDate: new Date('2026-07-01'),
      ...overrides,
    },
  });
}

export async function makeExpense(
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.expenseRecord.create({
    data: {
      organizationId,
      description: 'Gasto test',
      amount: 50000,
      currency: 'CLP',
      status: 'PENDING',
      expenseDate: new Date('2026-07-01'),
      ...overrides,
    },
  });
}

export async function makeClient(
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.client.create({
    data: { organizationId, rut: 'CLI-1', name: 'Cliente Test', ...overrides },
  });
}

export async function makeVendor(
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.vendor.create({
    data: { organizationId, rut: 'PROV-1', name: 'Proveedor Test', ...overrides },
  });
}

export async function makeBankAccount(
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  // Obligatorios: organizationId, accountNumber (único por empresa), name/bankName.
  // Confirmar los campos exactos leyendo el model BankAccount en schema.prisma.
  return prisma.bankAccount.create({
    data: {
      organizationId,
      accountNumber: '000-111',
      name: 'Cuenta Test',
      bankName: 'Banco Test',
      ...overrides,
    },
  });
}

// FinancialImportBatch requiere: type, periodMonth, originalFileName, fileSize,
// sourceHash. bankAccountId y previewData son opcionales. Los conteos default 0.
export async function makeImportBatch(
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
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
    },
  });
}

// BankTransaction requiere: bankAccountId E importBatchId (ambos FK obligatorios),
// transactionDate, description, dedupeKey.
export async function makeBankTransaction(
  args: {
    organizationId: string;
    bankAccountId: string;
    importBatchId: string;
  },
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
    },
  });
}
```
Nota: consultar `schema.prisma` para confirmar campos obligatorios exactos (p. ej. `documentKind` en income, y los reales de `BankAccount`) y ajustar los defaults antes de correr.

- [ ] **Step 3: Verificar que un test trivial arranca**

Crear temporalmente `backend/test/smoke.test.ts`:
```ts
import { beforeEach, afterAll, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg } from './fixtures';

beforeEach(resetDb);
afterAll(disconnect);

test('la BD de test funciona', async () => {
  const org = await makeOrg();
  expect(org.id).toBeTruthy();
});
```

Run:
```bash
npm test -- smoke
```
Expected: PASS (1 test). Luego borrar `smoke.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add backend/test/db.ts backend/test/fixtures.ts
git commit -m "test: helpers de reset de BD y factories de fixtures"
```

---

### Task 0.3: Tests de caracterización de `income.service`

**Files:**
- Create: `backend/test/income.service.test.ts`
- Reference (leer, no modificar): `backend/src/modules/income/income.service.ts`

- [ ] **Step 1: Escribir los tests de caracterización**

Cubrir el comportamiento ACTUAL (leer el service para fijar los valores esperados exactos). Estructura:
```ts
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeIncome } from './fixtures';
import * as income from '../src/modules/income/income.service';

beforeEach(resetDb);
afterAll(disconnect);

describe('income.list — paymentState', () => {
  test('receivable excluye NC, pagados y cancelados', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000 });
    await makeIncome(org.id, { status: 'PAID', paidDate: new Date('2026-07-02'), netAmount: 100000 });
    await makeIncome(org.id, { documentKind: 'CREDIT_NOTE', amount: -20000, netAmount: null });
    const res = await income.list({ organizationId: org.id, paymentState: 'receivable' });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('INVOICED');
  });

  test('paid solo trae con paidDate y status != CANCELLED', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'PAID', paidDate: new Date('2026-07-02') });
    await makeIncome(org.id, { status: 'INVOICED' });
    const res = await income.list({ organizationId: org.id, paymentState: 'paid' });
    expect(res).toHaveLength(1);
    expect(res[0].paidDate).not.toBeNull();
  });

  test('overdue = por cobrar con dueDate vencida', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, dueDate: new Date('2026-06-01') });
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, dueDate: new Date('2027-01-01') });
    const res = await income.list({ organizationId: org.id, paymentState: 'overdue' });
    expect(res).toHaveLength(1); // solo la vencida (leer income.service para fijar el criterio exacto de fecha)
  });

  test('cancelled en income = netAmount 0 (NO status CANCELLED)', async () => {
    // Detalle no obvio: income.service define paymentState "cancelled" como netAmount === 0
    // (factura anulada por NC), no como status === 'CANCELLED'. Ver income.service.ts.
    const org = await makeOrg();
    await makeIncome(org.id, { status: 'INVOICED', netAmount: 0 });
    const res = await income.list({ organizationId: org.id, paymentState: 'cancelled' });
    expect(res).toHaveLength(1);
  });
});

describe('income.registerPayment', () => {
  test('registerPayment con paidDate marca PAID', async () => {
    const org = await makeOrg();
    const inc = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000 });
    const res = await income.registerPayment(inc.id, { paidDate: new Date('2026-07-05') });
    expect(res.status).toBe('PAID');
    expect(res.paidDate).not.toBeNull();
  });
});

describe('income.update — reconcilePaidStatus', () => {
  test('marcar PAID sin fecha fija paidDate', async () => {
    const org = await makeOrg();
    const inc = await makeIncome(org.id, { status: 'INVOICED' });
    const upd = await income.update(inc.id, { status: 'PAID' });
    expect(upd.status).toBe('PAID');
    expect(upd.paidDate).not.toBeNull();
  });

  test('salir de PAID limpia paidDate y vínculo bancario', async () => {
    const org = await makeOrg();
    const inc = await makeIncome(org.id, { status: 'PAID', paidDate: new Date('2026-07-02') });
    const upd = await income.update(inc.id, { status: 'INVOICED' });
    expect(upd.paidDate).toBeNull();
  });
});

describe('income.create/update — enlace de cliente', () => {
  test('create con clientName enlaza clientId', async () => {
    const org = await makeOrg();
    // Se llama al service directamente (sin Zod), así que incomeDate debe ser un Date real,
    // no un string date-only (Prisma 5 lo rechazaría).
    const inc = await income.create({
      organizationId: org.id, description: 'x', amount: 1000, currency: 'CLP',
      status: 'INVOICED', clientName: 'ACME', incomeDate: new Date('2026-07-01'),
    } as never);
    expect(inc.clientId).toBeTruthy();
  });
});

describe('income.listMonths', () => {
  test('devuelve meses con datos, desc', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-05-10') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-10') });
    const months = await income.listMonths(org.id);
    expect(months[0]).toBe('2026-07');
    expect(months).toContain('2026-05');
  });
});
```

- [ ] **Step 2: Correr y verificar verde**

Run:
```bash
npm test -- income.service
```
Expected: PASS. Si algún assert no coincide con el comportamiento real, ajustar el ASSERT al comportamiento actual (son tests de caracterización: congelan lo que hoy hace el código, no lo que "debería").

- [ ] **Step 3: Commit**

```bash
git add backend/test/income.service.test.ts
git commit -m "test: caracterización de income.service"
```

---

### Task 0.4: Tests de caracterización de `expenses.service`

**Files:**
- Create: `backend/test/expenses.service.test.ts`
- Reference: `backend/src/modules/expenses/expenses.service.ts`

- [ ] **Step 1: Escribir tests espejo de income adaptados a gastos**

Cubrir: `list` con `paymentState` `payable`/`overdue`/`paid`/`cancelled`; `reconcilePaidStatus` (PAID→fija paidDate; salir de PAID→limpia); `create`/`update` con enlace de proveedor (`vendorName`→`vendorId`); `listMonths`. Usar `makeExpense` y `PAYABLE_STATUSES = PENDING/OVERDUE`. Mismo patrón que Task 0.3.

- [ ] **Step 2: Correr y verificar verde**

Run: `npm test -- expenses.service`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/test/expenses.service.test.ts
git commit -m "test: caracterización de expenses.service"
```

---

### Task 0.5: Tests de `clients.service` y `vendors.service`

**Files:**
- Create: `backend/test/clients.service.test.ts`, `backend/test/vendors.service.test.ts`
- Reference: `backend/src/modules/clients/clients.service.ts`, `backend/src/modules/vendors/vendors.service.ts`

- [ ] **Step 1: Tests de `clients.service`**

Cubrir `computeStats` vía `listClients`/`getClient`: sembrar un cliente (crear `Client` + varios `IncomeRecord` con `clientId`) y assertar `netSales`, `grossInvoiced`, `totalCreditNotes`, `collectedAmount` (facturas con paidDate), `pendingAmount` (sin paidDate), exclusión de NC del cobrado/pendiente y de CANCELLED. Probar `search` por nombre/RUT.

Ejemplo del assert clave (cobrado/pendiente):
```ts
test('collected/pending separan pagadas de por cobrar y excluyen NC/anuladas', async () => {
  const org = await makeOrg();
  const cli = await prisma.client.create({ data: { organizationId: org.id, rut: 'ACME', name: 'ACME' } });
  await makeIncome(org.id, { clientId: cli.id, amount: 100000, status: 'INVOICED' });
  await makeIncome(org.id, { clientId: cli.id, amount: 50000, status: 'PAID', paidDate: new Date('2026-07-02') });
  await makeIncome(org.id, { clientId: cli.id, documentKind: 'CREDIT_NOTE', amount: -10000 });
  const detail = await clients.getClient(cli.id);
  expect(detail.stats.collectedAmount).toBe(50000);
  expect(detail.stats.pendingAmount).toBe(100000);
});
```

- [ ] **Step 2: Tests de `vendors.service`**

Cubrir `computeStats`: `totalSpent`, `paidAmount` (con paidDate), `pendingAmount = total - paid`, exclusión de CANCELLED. `search`.

- [ ] **Step 3: Correr verde y commit**

Run: `npm test -- clients.service vendors.service`
Expected: PASS.
```bash
git add backend/test/clients.service.test.ts backend/test/vendors.service.test.ts
git commit -m "test: caracterización de clients.service y vendors.service"
```

---

### Task 0.6: Tests de `shared/parties` (`resolveClientId`/`resolveVendorId`)

**Files:**
- Create: `backend/test/parties.test.ts`
- Reference: `backend/src/modules/shared/parties.ts`

- [ ] **Step 1: Tests del comportamiento actual**

Cubrir: nombre vacío → `null`; nombre nuevo → crea y devuelve id; mismo nombre (case-insensitive, con espacios) → reutiliza el mismo id (no duplica); idem para `resolveVendorId`.
```ts
test('resolveClientId reutiliza por nombre case-insensitive', async () => {
  const org = await makeOrg();
  const a = await parties.resolveClientId(org.id, 'ACME');
  const b = await parties.resolveClientId(org.id, '  acme ');
  expect(b).toBe(a);
});
```

- [ ] **Step 2: Correr verde y commit**

Run: `npm test -- parties`
```bash
git add backend/test/parties.test.ts
git commit -m "test: caracterización de shared/parties"
```

---

### Task 0.7: Tests de `finance.service` (resumen + conciliación) — requisito firme

**Files:**
- Create: `backend/test/finance.service.test.ts`
- Reference (leer en detalle): `backend/src/modules/finance/finance.service.ts`

- [ ] **Step 1: Leer el service y mapear firmas**

Leer `finance.service.ts` e identificar las firmas exactas de `getSummary`, `getConsolidated`, `getReconciliationSummary`, `autoReconcile` (parámetros y forma del retorno). Estos tests son la garantía de la lógica de dinero: escribirlos con cuidado.

- [ ] **Step 2: Tests de resumen/consolidado**

Sembrar ingresos/gastos con estados variados y assertar los KPIs de `getSummary` (por cobrar, por pagar, vencidos) y de `getConsolidated`. Fijar los valores al comportamiento actual.

- [ ] **Step 3: Tests de conciliación (los 3 casos del spec)**

Receta de siembra (un `BankTransaction` NO se puede crear sin `bankAccountId` **e** `importBatchId`, ambos FK obligatorios): `makeBankAccount` → `makeImportBatch` → `makeBankTransaction`. Un abono (`creditAmount`) cruza con un ingreso por cobrar; un cargo (`chargeAmount`) con un gasto por pagar.

```ts
import { makeOrg, makeIncome, makeBankAccount, makeImportBatch, makeBankTransaction } from './fixtures';
import * as finance from '../src/modules/finance/finance.service';
import * as income from '../src/modules/income/income.service';

test('autoReconcile enlaza solo el cruce inequívoco 1:1', async () => {
  const org = await makeOrg();
  const acc = await makeBankAccount(org.id);
  // Si autoReconcile/getReconciliationSummary filtran por type de batch, usar 'BANK_STATEMENT'.
  const batch = await makeImportBatch(org.id, { bankAccountId: acc.id, type: 'BANK_STATEMENT' });
  // 1 factura sin pagar de 100.000
  const inc = await makeIncome(org.id, { status: 'INVOICED', netAmount: 100000, amount: 100000 });
  // 1 abono de 100.000, misma empresa, dentro de la ventana de fecha
  await makeBankTransaction(
    { organizationId: org.id, bankAccountId: acc.id, importBatchId: batch.id },
    { creditAmount: 100000, transactionDate: new Date('2026-07-05') },
  );
  // Leer finance.service para la firma exacta de autoReconcile (parámetros + retorno).
  const res = await finance.autoReconcile({ organizationId: org.id, apply: true } as never);
  // Assertar: 1 enlace aplicado; la factura quedó PAID con paidByBankTransactionId seteado.
  const after = await income.list({ organizationId: org.id, paymentState: 'paid' });
  expect(after).toHaveLength(1);
});
```

1. **Cruce inequívoco 1:1** (arriba) → enlaza.
2. **Ambigüedad** (DOS ingresos de 100.000 y un solo abono de 100.000, o dos abonos) → `autoReconcile` NO toca nada (0 enlaces). Assertar que ninguna factura quedó PAID.
3. **Traspaso interno** (movimiento cuya descripción lo marca como traspaso, según `transferPayee`/`recognizeTransfers`) → excluido del cuadre en `getReconciliationSummary` (el campo `internal`). Leer `finance.service` para el criterio exacto de detección y assertar sobre el resumen.

- [ ] **Step 4: Correr verde y commit**

Run: `npm test -- finance.service`
Expected: PASS.
```bash
git add backend/test/finance.service.test.ts
git commit -m "test: caracterización de finance.service (resumen + conciliación)"
```

---

### Task 0.8: Tests del pipeline `finance-imports` + serde — requisito firme

**Files:**
- Create: `backend/test/finance-imports.service.test.ts`
- Reference (leer en detalle): `backend/src/modules/finance-imports/finance-imports.service.ts`, `finance-imports.parser.ts`

- [ ] **Step 1: Leer `createRow` para fijar la forma de `StoredPreviewRow`**

Leer `createRow` (`finance-imports.service.ts:734+`) y anotar qué claves de `row.data` lee para cada tipo (`SALES_REPORT`: `clientName`, `sourceRut`, `documentKind`, `amount`, `currency`, `description`, `category`…; `PURCHASE_REPORT`: `vendorName`, `sourceRut`, `amount`, `currency`, `description`…) y que usa `row.dedupeKey`. Nota clave: `serializeRows`/`deserializeRows` son **privados y asimétricos** (serialize convierte `Date`→ISO string; deserialize es solo un cast), así que NO se testean por identidad ni por import directo. Se ejercitan **a través de `confirmImport`**, que llama internamente a `deserializeRows(batch.previewData)`.

- [ ] **Step 2: Test de `confirmImport` (compras) crafteando `previewData` directamente**

`confirmImport(batchId)` lee `batch.previewData` (JSON) y lo pasa por `deserializeRows`. Podemos construir ese JSON literal con la forma de `StoredPreviewRow` (no hace falta exportar el serde):
```ts
import { beforeEach, afterAll, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import { makeOrg, makeBankAccount } from './fixtures';
import { prisma } from '../src/lib/prisma';
import * as imports from '../src/modules/finance-imports/finance-imports.service';

beforeEach(resetDb);
afterAll(disconnect);

test('confirmImport de compras crea gastos y enlaza proveedor por RUT', async () => {
  const org = await makeOrg();
  // previewData con la forma que produce serializeRows (StoredPreviewRow[]).
  // Completar las claves de `data` según lo anotado en Step 1.
  const previewData = [
    {
      status: 'VALID',
      dedupeKey: 'buy-1',
      data: {
        vendorName: 'Proveedor X',
        sourceRut: '76.222.222-2',
        amount: 50000,
        currency: 'CLP',
        description: 'Factura compra 1',
      },
      rawData: {},
    },
  ];
  const batch = await prisma.financialImportBatch.create({
    data: {
      organizationId: org.id,
      type: 'PURCHASE_REPORT',
      status: 'PREVIEW',
      periodMonth: new Date('2026-07-01'),
      originalFileName: 'compras.xlsx',
      fileSize: 1,
      sourceHash: 'hash-buy-1',
      previewData: previewData as never,
    },
  });

  await imports.confirmImport(batch.id);

  const expenses = await prisma.expenseRecord.findMany({ where: { organizationId: org.id } });
  expect(expenses).toHaveLength(1);
  expect(expenses[0].vendorId).toBeTruthy(); // proveedor upserted por RUT
  expect(expenses[0].importBatchId).toBe(batch.id);
});
```
Nota: si `confirmImport` carga reglas de categorización desde la BD, con la BD vacía la lista de reglas queda vacía y `category` sale null — no bloquea el test.

- [ ] **Step 3: Test de `confirmImport` (ventas) + dedupe**

Igual pero con `type: 'SALES_REPORT'` y `data` de ventas (`clientName`/`sourceRut`/`documentKind: 'SALE'`/`amount`): assertar que se crea 1 `IncomeRecord` con `clientId` seteado. Añadir un segundo test donde una fila trae un `dedupeKey`/`sourceRut` ya existente y verificar el comportamiento de dedupe actual (leer `confirmImport`/`createRow` para el criterio exacto y fijarlo en el assert).

- [ ] **Step 4: Correr verde y commit**

Run: `npm test -- finance-imports`
Expected: PASS.
```bash
git add backend/test/finance-imports.service.test.ts
git commit -m "test: caracterización de finance-imports (confirmImport + serde vía pipeline)"
```

- [ ] **Step 5: Correr TODA la suite (criterio de salida de Fase 0)**

Run: `npm test`
Expected: TODOS los archivos en verde (income, expenses, clients, vendors, parties, finance, finance-imports).

---

## Chunk 2: Fase 1 — Extracción compartida (backend)

**Regla de oro:** tras cada extracción, correr `npm test` SIN modificar los tests. Si algo se pone rojo, el refactor cambió comportamiento → revertir/ajustar hasta verde.

### Task 1.1: Crear `shared/ledger.ts` con helpers + su test

**Files:**
- Create: `backend/src/modules/shared/ledger.ts`
- Create: `backend/test/ledger.test.ts`
- Reference: `income.service.ts` (`reconcilePaidStatus`, `listMonths`, filtro `month`), `expenses.service.ts`

- [ ] **Step 1: Escribir `ledger.ts`**

`backend/src/modules/shared/ledger.ts`:
```ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// Estados de un ingreso aún por cobrar.
export const PENDING_INCOME_STATUSES = ['EXPECTED', 'INVOICED', 'OVERDUE'] as const;
// Estados de un gasto aún por pagar.
export const PAYABLE_EXPENSE_STATUSES = ['PENDING', 'OVERDUE'] as const;

// Invariante de pago: PAID ⇔ hay paidDate. Al marcar PAID sin fecha se fija hoy;
// al salir de PAID se limpia paidDate y el vínculo bancario. Común a income/expenses.
export function reconcilePaidStatus<T extends { status?: string | null }>(
  input: T,
  currentPaidDate: Date | null,
): T & { paidDate?: Date | null; paidByBankTransactionId?: string | null } {
  if (input.status === undefined) return input;
  if (input.status === 'PAID') {
    return { ...input, paidDate: currentPaidDate ?? new Date() };
  }
  return { ...input, paidDate: null, paidByBankTransactionId: null };
}

// Rango [gte, lt) del mes YYYY-MM en UTC, para filtrar por fecha.
export function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
}

// Whitelist tipada: el identificador de tabla/columna NO puede ir como parámetro.
const MONTHS_SOURCES = {
  income: { table: 'income_records', column: 'incomeDate' },
  expense: { table: 'expense_records', column: 'expenseDate' },
} as const;

// Meses (YYYY-MM) con datos, desc. `organizationId` sí va parametrizado.
export async function listMonths(
  source: keyof typeof MONTHS_SOURCES,
  organizationId?: string,
): Promise<string[]> {
  const { table, column } = MONTHS_SOURCES[source];
  const orgClause = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('month', ${Prisma.raw(`"${column}"`)}), 'YYYY-MM') AS mes
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.raw(`"${column}"`)} IS NOT NULL ${orgClause}
    ORDER BY mes DESC
  `);
  return rows.map((r) => r.mes);
}
```
Nota: `Prisma.raw` con valores de una whitelist constante (no input de usuario) es seguro.

- [ ] **Step 2: Test unitario de `ledger.ts`**

`backend/test/ledger.test.ts`: `reconcilePaidStatus` (3 ramas: undefined, PAID, no-PAID), `monthRange` (bordes UTC), `listMonths` para `income` y `expense`.

- [ ] **Step 3: Correr verde**

Run: `npm test -- ledger`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/shared/ledger.ts backend/test/ledger.test.ts
git commit -m "refactor: extraer helpers de ledger (reconcilePaidStatus, monthRange, listMonths)"
```

---

### Task 1.2: `income.service` usa `shared/ledger`

**Files:**
- Modify: `backend/src/modules/income/income.service.ts`

- [ ] **Step 1: Reemplazar el helper local y `listMonths`**

- Borrar la definición local de `reconcilePaidStatus` e importar `reconcilePaidStatus` de `../shared/ledger`.
- Reemplazar el bloque del filtro `month` (`const [y, m] = ...`) por `where.incomeDate = monthRange(filters.month)`.
- Reemplazar el cuerpo de `listMonths` por `return ledgerListMonths('income', organizationId)`.
- Mover `PENDING_STATUSES` a usar `PENDING_INCOME_STATUSES` del ledger (o mantener el `RECEIVABLE_OR` local, que es específico de income).

- [ ] **Step 2: Correr la suite SIN modificar tests**

Run: `npm test -- income`
Expected: PASS (income.service.test.ts sigue verde). Además `npm run build` (typecheck).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/income/income.service.ts
git commit -m "refactor: income.service usa shared/ledger"
```

---

### Task 1.3: `expenses.service` usa `shared/ledger`

**Files:**
- Modify: `backend/src/modules/expenses/expenses.service.ts`

- [ ] **Step 1: Misma extracción que income**

`reconcilePaidStatus`, `monthRange`, `listMonths('expense', ...)`, `PAYABLE_EXPENSE_STATUSES`.

- [ ] **Step 2: Correr verde + typecheck**

Run: `npm test -- expenses` y `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/expenses/expenses.service.ts
git commit -m "refactor: expenses.service usa shared/ledger"
```

---

### Task 1.4: Unificar `shared/parties` en `resolveParty` y usarlo en finance-imports

**Files:**
- Modify: `backend/src/modules/shared/parties.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts`
- Reference: los `upsertClient`/`upsertVendor` actuales en finance-imports

- [ ] **Step 1: Añadir `resolveParty` unificado (por nombre y por RUT)**

En `parties.ts`, añadir un `resolveParty` que cubra ambos caminos, manteniendo `resolveClientId`/`resolveVendorId` como wrappers finos (para no romper income/expenses):
```ts
type PartyModel = 'client' | 'vendor';

export async function resolveParty(args: {
  model: PartyModel;
  organizationId: string;
  rut?: string | null;
  name?: string | null;
}): Promise<string | null> {
  const { model, organizationId } = args;
  const rut = args.rut?.trim();
  const name = args.name?.trim();
  const delegate = model === 'client' ? prisma.client : prisma.vendor;
  // Camino import: hay RUT → upsert por (org, rut).
  if (rut) {
    const row = await (delegate as typeof prisma.client).upsert({
      where: { organizationId_rut: { organizationId, rut } },
      create: { organizationId, rut, name: name || rut },
      update: name ? { name } : {},
      select: { id: true },
    });
    return row.id;
  }
  // Camino manual: solo nombre → find/create por nombre.
  if (!name) return null;
  const existing = await (delegate as typeof prisma.client).findFirst({
    where: { organizationId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await (delegate as typeof prisma.client).create({
      data: { organizationId, name, rut: name },
      select: { id: true },
    });
    return created.id;
  } catch {
    const again = await (delegate as typeof prisma.client).findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    return again?.id ?? null;
  }
}

export function resolveClientId(organizationId: string, name: string | null | undefined) {
  return resolveParty({ model: 'client', organizationId, name });
}
export function resolveVendorId(organizationId: string, name: string | null | undefined) {
  return resolveParty({ model: 'vendor', organizationId, name });
}
```
Nota sobre tipos: el cast `as typeof prisma.client` evita el conflicto de unión de delegates de Prisma. Verificar que `client` y `vendor` comparten la forma usada (`organizationId_rut`, `name`, `rut`); ambos la tienen según `schema.prisma`.

- [ ] **Step 2: Reemplazar `upsertClient`/`upsertVendor` en finance-imports**

En `finance-imports.service.ts`, sustituir las llamadas a `upsertClient(tx, org, rut, name)` / `upsertVendor(...)` por `resolveParty({ model, organizationId, rut, name })` y borrar las funciones locales. Ojo: si el upsert se hacía dentro de una transacción `tx`, evaluar si `resolveParty` debe aceptar un cliente `tx` opcional; si el enlace de parte puede ocurrir fuera de la transacción sin romper atomicidad relevante, usar `prisma` directamente. Documentar la decisión en un comentario.

- [ ] **Step 3: Correr suites afectadas SIN modificar tests**

Run: `npm test -- parties income expenses finance-imports` y `npm run build`
Expected: PASS (parties, income, expenses y finance-imports siguen verdes).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/shared/parties.ts backend/src/modules/finance-imports/finance-imports.service.ts
git commit -m "refactor: unificar enlace de parte en resolveParty (manual + import)"
```

---

### Task 1.5: Extraer patrón común de `clients`/`vendors` services

**Files:**
- Create: `backend/src/modules/shared/party-stats.ts` (helper `listParties`/`getParty`)
- Modify: `backend/src/modules/clients/clients.service.ts`
- Modify: `backend/src/modules/vendors/vendors.service.ts`

- [ ] **Step 1: Escribir `party-stats.ts`**

Un helper genérico que reciba el modelo (`client`/`vendor`), la relación de documentos (`incomes`/`expenses`), el `statsSelect` y una `statsFn`, y produzca `listParties(filters)` y `getParty(id)`. Cada service mantiene su propio `computeStats` (divergen: NC/collected/pending vs paid/pending) y lo inyecta.

- [ ] **Step 2: Refactorizar `clients.service` y `vendors.service` para usarlo**

`listClients`/`getClient` y `listVendors`/`getVendor` delegan en `listParties`/`getParty` con su `computeStats`.

- [ ] **Step 3: Correr verde SIN modificar tests + typecheck**

Run: `npm test -- clients vendors` y `npm run build`
Expected: PASS.

- [ ] **Step 4: Correr TODA la suite (criterio de salida de Fase 1)**

Run: `npm test` (todo verde) y `npm run build` (typecheck limpio).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/shared/party-stats.ts backend/src/modules/clients/clients.service.ts backend/src/modules/vendors/vendors.service.ts
git commit -m "refactor: extraer listParties/getParty comunes a clients/vendors"
```

---

## Cierre de Fase 0 + 1

- [ ] **Verificación final**

Run:
```bash
npm test          # toda la suite verde
npm run build     # typecheck backend limpio
```
Expected: ambos OK. El comportamiento del dominio Finanzas es idéntico al inicial (garantizado por los tests de caracterización sin modificar) y la duplicación de helpers de ledger, enlace de parte y stats de parte quedó eliminada.

- [ ] **Nota de handoff a Fase 2**

Las Fases 2 (trocear `finance-imports.service.ts` y `finance.service.ts`), 3 (dividir `useFinance.ts`/`types/domain.ts` + fix de invalidación) y 4 (UI genérica) tienen su propio plan cada una. La suite de Fase 0 es su red de seguridad: se corre sin modificar tras cada troceo de backend.
