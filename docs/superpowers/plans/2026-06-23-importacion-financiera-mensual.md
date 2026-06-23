# Importacion Financiera Mensual Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el flujo mensual de importacion financiera con seleccion de empresa/cuenta, vista previa, confirmacion y trazabilidad de ventas, compras y cartolas.

**Architecture:** Se agregan modelos Prisma para cuentas bancarias, lotes de importacion y movimientos bancarios, mas campos de trazabilidad en ingresos/gastos. El backend incorpora un modulo `finance-imports` con parser puro, preview persistida y confirmacion transaccional. El frontend suma una pestana `Importaciones` en `/finanzas`, hooks de React Query y soporte de uploads `multipart/form-data`.

**Tech Stack:** Express, Prisma, Zod, React, Vite, TanStack Query, TypeScript, `node:test` via `tsx --test`, parser Excel con dependencia segura compatible `.xlsx`/`.xls`.

---

## Chunk 1: Modelo Prisma y tipos base

### Task 1: Agregar modelos de importacion financiera

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `frontend/src/types/domain.ts`

- [ ] **Step 1: Editar schema Prisma**

Agregar enums despues de `RecurrenceFrequency`:

```prisma
enum FinancialImportType {
  SALES_REPORT
  PURCHASE_REPORT
  BANK_STATEMENT
}

enum FinancialImportStatus {
  PREVIEW
  CONFIRMED
  FAILED
}
```

Agregar relaciones en `Organization`:

```prisma
bankAccounts           BankAccount[]
financialImportBatches FinancialImportBatch[]
bankTransactions       BankTransaction[]
```

Agregar modelos:

```prisma
model BankAccount {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  bankName       String?
  accountNumber  String
  currency       String   @default("CLP")
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  importBatches FinancialImportBatch[]
  transactions  BankTransaction[]

  @@unique([organizationId, accountNumber])
  @@index([organizationId])
  @@index([isActive])
  @@map("bank_accounts")
}

model FinancialImportBatch {
  id             String                @id @default(cuid())
  organizationId String
  bankAccountId  String?
  type           FinancialImportType
  status         FinancialImportStatus @default(PREVIEW)
  periodMonth    DateTime
  originalFileName String
  fileSize       Int
  sourceHash     String
  rowsTotal      Int                   @default(0)
  rowsValid      Int                   @default(0)
  rowsSkipped    Int                   @default(0)
  rowsDuplicated Int                   @default(0)
  totalIncome    Int                   @default(0)
  totalExpense   Int                   @default(0)
  totalCharges   Int                   @default(0)
  totalCredits   Int                   @default(0)
  warnings       Json?
  previewData    Json?
  createdAt      DateTime              @default(now())
  confirmedAt    DateTime?

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  bankAccount  BankAccount? @relation(fields: [bankAccountId], references: [id], onDelete: SetNull)
  incomeRecords IncomeRecord[]
  expenseRecords ExpenseRecord[]
  bankTransactions BankTransaction[]

  @@index([organizationId])
  @@index([type])
  @@index([periodMonth])
  @@index([status])
  @@index([sourceHash])
  @@map("financial_import_batches")
}

model BankTransaction {
  id              String   @id @default(cuid())
  organizationId  String
  bankAccountId   String
  importBatchId   String
  transactionDate DateTime
  description     String
  channel         String?
  documentNumber  String?
  chargeAmount    Int      @default(0)
  creditAmount    Int      @default(0)
  balance         Int?
  currency        String   @default("CLP")
  rawData         Json?
  dedupeKey       String
  createdAt       DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  bankAccount  BankAccount @relation(fields: [bankAccountId], references: [id], onDelete: Cascade)
  importBatch  FinancialImportBatch @relation(fields: [importBatchId], references: [id], onDelete: Cascade)

  @@unique([bankAccountId, dedupeKey])
  @@index([organizationId])
  @@index([bankAccountId])
  @@index([transactionDate])
  @@map("bank_transactions")
}
```

Agregar campos opcionales en `IncomeRecord` y `ExpenseRecord`:

```prisma
importBatchId      String?
sourceDocumentType String?
sourceFolio        String?
sourceRut          String?
sourceIssueDate    DateTime?
sourceDedupeKey    String? @unique
rawData            Json?

importBatch FinancialImportBatch? @relation(fields: [importBatchId], references: [id], onDelete: SetNull)
```

Agregar indices en ambos modelos:

```prisma
@@index([importBatchId])
@@index([sourceIssueDate])
```

- [ ] **Step 2: Regenerar Prisma**

Run: `cd backend && npm run prisma:generate`  
Expected: Prisma Client generado sin errores.

- [ ] **Step 3: Crear migracion**

Run: `cd backend && npm run prisma:migrate`  
Expected: migracion creada y aplicada localmente. Si el script fuerza nombre `init`, revisar carpeta nueva en `backend/prisma/migrations/`.

- [ ] **Step 4: Agregar tipos frontend**

En `frontend/src/types/domain.ts`, agregar:

```ts
export type FinancialImportType =
  | 'SALES_REPORT'
  | 'PURCHASE_REPORT'
  | 'BANK_STATEMENT';

export type FinancialImportStatus = 'PREVIEW' | 'CONFIRMED' | 'FAILED';

export interface BankAccount {
  id: string;
  organizationId: string;
  name: string;
  bankName: string | null;
  accountNumber: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
}

export interface BankTransaction {
  id: string;
  organizationId: string;
  bankAccountId: string;
  importBatchId: string;
  transactionDate: string;
  description: string;
  channel: string | null;
  documentNumber: string | null;
  chargeAmount: number;
  creditAmount: number;
  balance: number | null;
  currency: string;
  createdAt: string;
  organization?: Ref;
  bankAccount?: Pick<BankAccount, 'id' | 'name' | 'accountNumber'>;
}

export interface FinancialImportBatch {
  id: string;
  organizationId: string;
  bankAccountId: string | null;
  type: FinancialImportType;
  status: FinancialImportStatus;
  periodMonth: string;
  originalFileName: string;
  fileSize: number;
  sourceHash: string;
  rowsTotal: number;
  rowsValid: number;
  rowsSkipped: number;
  rowsDuplicated: number;
  totalIncome: number;
  totalExpense: number;
  totalCharges: number;
  totalCredits: number;
  createdAt: string;
  confirmedAt: string | null;
  organization?: Ref;
  bankAccount?: Pick<BankAccount, 'id' | 'name' | 'accountNumber'> | null;
}
```

- [ ] **Step 5: Build backend**

Run: `cd backend && npm run build`  
Expected: PASS.

- [ ] **Step 6: Lint frontend**

Run: `cd frontend && npm run lint`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations frontend/src/types/domain.ts
git commit -m "feat: agrega modelo de importacion financiera"
```

---

## Chunk 2: Parser puro y pruebas

### Task 2: Instalar parser seguro de Excel

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

- [ ] **Step 1: Instalar dependencia**

Run: `cd backend && npm install xlsx`  
Expected: dependencia agregada. Nota: `xlsx` lee `.xlsx` y `.xls` sin abrir Excel/COM.

- [ ] **Step 2: Confirmar build limpio**

Run: `cd backend && npm run build`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: agrega parser de planillas"
```

### Task 3: Escribir pruebas rojas del parser

**Files:**
- Create: `backend/src/modules/finance-imports/finance-imports.parser.ts`
- Create: `backend/tests/finance-imports.parser.test.ts`

- [ ] **Step 1: Crear archivo parser vacio con tipos deseados**

```ts
export type ImportRowStatus = 'VALID' | 'WARNING' | 'DUPLICATE' | 'ERROR';

export interface ParsedImportRow {
  status: ImportRowStatus;
  dedupeKey: string;
  warnings: string[];
  data: Record<string, unknown>;
  rawData: Record<string, unknown>;
}

export interface ParsedImportPreview {
  rows: ParsedImportRow[];
  rowsTotal: number;
  rowsValid: number;
  rowsSkipped: number;
  totalIncome: number;
  totalExpense: number;
  totalCharges: number;
  totalCredits: number;
  warnings: string[];
}

export function normalizeMoney(value: unknown): number {
  throw new Error('Pendiente');
}

export function normalizeRut(value: unknown): string {
  throw new Error('Pendiente');
}

export function normalizeDate(value: unknown): Date | null {
  throw new Error('Pendiente');
}

export function parseSalesRows(_rows: Record<string, unknown>[]): ParsedImportPreview {
  throw new Error('Pendiente');
}

export function parsePurchaseRows(_rows: Record<string, unknown>[]): ParsedImportPreview {
  throw new Error('Pendiente');
}

export function parseBankRows(_rows: Record<string, unknown>[], _bankAccountId: string): ParsedImportPreview {
  throw new Error('Pendiente');
}
```

- [ ] **Step 2: Escribir pruebas de normalizacion**

En `backend/tests/finance-imports.parser.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate,
  normalizeMoney,
  normalizeRut,
  parseBankRows,
  parsePurchaseRows,
  parseSalesRows,
} from '../src/modules/finance-imports/finance-imports.parser';

test('normaliza montos chilenos desde numero y texto', () => {
  assert.equal(normalizeMoney(168179), 168179);
  assert.equal(normalizeMoney('1.681.790'), 1681790);
  assert.equal(normalizeMoney('$ 25.450'), 25450);
  assert.equal(normalizeMoney('-25.000'), -25000);
});

test('normaliza rut removiendo puntos y manteniendo guion', () => {
  assert.equal(normalizeRut('15.710.922-7'), '15710922-7');
  assert.equal(normalizeRut(' 97036000-K '), '97036000-K');
});

test('normaliza fechas dd-mm-yyyy y Date', () => {
  assert.equal(normalizeDate('30-01-2026')?.toISOString().slice(0, 10), '2026-01-30');
  assert.equal(normalizeDate(new Date('2026-02-01T00:00:00.000Z'))?.toISOString().slice(0, 10), '2026-02-01');
  assert.equal(normalizeDate(''), null);
});
```

- [ ] **Step 3: Escribir prueba de ventas**

Agregar:

```ts
test('parsea filas de ventas como ingresos', () => {
  const preview = parseSalesRows([
    {
      DOCUMENTO: 'FACTURA NO AFECTA O EXENTA ELECTRONICA',
      FOLIO: '1977',
      FECHA: '30-01-2026',
      RUT: '78.191.550-5',
      'RAZON SOCIAL': 'LABORATORIO CLINICO DIAGNOSTICO CLINILAB LTDA',
      TOTAL: '300000',
      PAGADO: 'NO',
      'FECHA VENCIMIENTO DOCUMENTO': '30-01-2026',
    },
    {
      DOCUMENTO: 'NOTA DE CREDITO ELECTRONICA',
      FOLIO: '822',
      FECHA: '31-01-2026',
      RUT: '15.710.922-7',
      'RAZON SOCIAL': 'CARLA MORENO ARANCIBIA',
      TOTAL: '-25000',
      PAGADO: 'NO',
    },
  ]);

  assert.equal(preview.rowsTotal, 2);
  assert.equal(preview.rowsValid, 2);
  assert.equal(preview.totalIncome, 275000);
  assert.equal(preview.rows[0].data.status, 'INVOICED');
  assert.equal(preview.rows[0].data.clientName, 'LABORATORIO CLINICO DIAGNOSTICO CLINILAB LTDA');
});
```

- [ ] **Step 4: Escribir prueba de compras**

Agregar:

```ts
test('parsea filas de compras como gastos', () => {
  const preview = parsePurchaseRows([
    {
      DOCUMENTO: 'FACTURA ELECTRONICA',
      FOLIO: '5351863',
      'FECHA DOCUMENTO': '30-01-2026',
      'FECHA VENCIMIENTO': '',
      RUT: '77190692-3',
      'RAZON SOCIAL': 'SOCIEDAD OPERADORA DE TARJETAS DE PAGO SANTANDER GETNET CHILE S.A.',
      TOTAL: '168179',
      PAGADO: 'SI',
    },
  ]);

  assert.equal(preview.rowsTotal, 1);
  assert.equal(preview.rowsValid, 1);
  assert.equal(preview.totalExpense, 168179);
  assert.equal(preview.rows[0].data.status, 'PAID');
  assert.equal(preview.rows[0].data.vendorName, 'SOCIEDAD OPERADORA DE TARJETAS DE PAGO SANTANDER GETNET CHILE S.A.');
});
```

- [ ] **Step 5: Escribir prueba de cartola**

Agregar:

```ts
test('parsea filas de cartola como movimientos bancarios', () => {
  const preview = parseBankRows([
    {
      Fecha: '01-02-2026',
      Descripcion: 'Traspaso A Cuenta: 004210162604',
      'Canal o Sucursal': 'Internet',
      Documento: '123',
      'Cargos (CLP)': '50000',
      'Abonos (CLP)': '',
      'Saldo (CLP)': '950000',
    },
    {
      Fecha: '02-02-2026',
      Descripcion: 'Abono cliente',
      'Canal o Sucursal': 'Internet',
      Documento: '124',
      'Cargos (CLP)': '',
      'Abonos (CLP)': '75000',
      'Saldo (CLP)': '1025000',
    },
  ], 'bank_1');

  assert.equal(preview.rowsTotal, 2);
  assert.equal(preview.rowsValid, 2);
  assert.equal(preview.totalCharges, 50000);
  assert.equal(preview.totalCredits, 75000);
  assert.equal(preview.rows[0].data.chargeAmount, 50000);
  assert.equal(preview.rows[1].data.creditAmount, 75000);
});
```

- [ ] **Step 6: Ejecutar pruebas y verificar RED**

Run: `cd backend && npx tsx --test tests/finance-imports.parser.test.ts`  
Expected: FAIL por `Pendiente`.

### Task 4: Implementar parser minimo

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.parser.ts`

- [ ] **Step 1: Implementar helpers de normalizacion**

Implementar funciones puras:

```ts
function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeMoney(value: unknown): number {
  if (typeof value === 'number') return Math.round(value);
  const raw = text(value).replace(/\$/g, '').replace(/\s/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function normalizeRut(value: unknown): string {
  return text(value).replace(/\./g, '').toUpperCase();
}
```

- [ ] **Step 2: Implementar fechas**

Soportar `Date`, `yyyy-mm-dd`, `dd-mm-yyyy`, `dd/mm/yyyy`.

- [ ] **Step 3: Implementar `parseSalesRows`**

Crear `ParsedImportRow` con `data` compatible con `IncomeRecord.createMany`, excepto `organizationId/importBatchId` que se agregan en service.

- [ ] **Step 4: Implementar `parsePurchaseRows`**

Crear `ParsedImportRow` con `data` compatible con `ExpenseRecord.createMany`, excepto `organizationId/importBatchId`.

- [ ] **Step 5: Implementar `parseBankRows`**

Detectar columnas con variantes: `Fecha`, `Descripcion`, `Descripción`, `Canal o Sucursal`, `Documento`, `Numero Documento`, `Cargos (CLP)`, `Abonos (CLP)`, `Saldo (CLP)`.

- [ ] **Step 6: Ejecutar pruebas y verificar GREEN**

Run: `cd backend && npx tsx --test tests/finance-imports.parser.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.parser.ts backend/tests/finance-imports.parser.test.ts
git commit -m "feat: agrega parser de importaciones financieras"
```

---

## Chunk 3: Backend de preview y confirmacion

### Task 5: Crear schemas, service, controller y routes

**Files:**
- Create: `backend/src/modules/finance-imports/finance-imports.schema.ts`
- Create: `backend/src/modules/finance-imports/finance-imports.service.ts`
- Create: `backend/src/modules/finance-imports/finance-imports.controller.ts`
- Create: `backend/src/modules/finance-imports/finance-imports.routes.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Escribir schemas Zod**

Definir:

```ts
export const importTypeEnum = z.enum(['SALES_REPORT', 'PURCHASE_REPORT', 'BANK_STATEMENT']);
export const createBankAccountSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  name: z.string().trim().min(2, 'El nombre de la cuenta es obligatorio'),
  bankName: optionalShortText,
  accountNumber: z.string().trim().min(2, 'El número de cuenta es obligatorio'),
  currency: currency.default('CLP'),
});
export const updateBankAccountSchema = createBankAccountSchema.omit({ organizationId: true }).partial();
export const previewImportSchema = z.object({
  organizationId: z.string().min(1, 'La empresa es obligatoria'),
  bankAccountId: z.string().min(1).optional().nullable(),
  type: importTypeEnum,
  periodMonth: dateInput,
});
export const confirmImportSchema = z.object({
  batchId: z.string().min(1, 'El lote es obligatorio'),
});
```

- [ ] **Step 2: Implementar listado/creacion de cuentas**

Service:

```ts
export async function listBankAccounts(organizationId?: string) { ... }
export async function createBankAccount(input: CreateBankAccountInput) { ... }
export async function updateBankAccount(id: string, input: UpdateBankAccountInput) { ... }
```

Usar `assertOrganization` para validar empresa y traducir `P2002` a `badRequest('Ya existe una cuenta con ese número para la empresa')`.

- [ ] **Step 3: Implementar lectura de workbook**

En service, usar `xlsx.read(file.buffer, { type: 'buffer', cellDates: true })`, convertir primera hoja o `DETALLE` a `Record<string, unknown>[]`.

- [ ] **Step 4: Implementar preview**

`previewImport(input, file)` debe:

- Validar archivo presente.
- Validar `bankAccountId` si `type === 'BANK_STATEMENT'`.
- Calcular `sourceHash` con `crypto.createHash('sha256')`.
- Parsear filas segun tipo.
- Consultar dedupe keys existentes por tipo.
- Marcar filas duplicadas.
- Crear `FinancialImportBatch` con `status: 'PREVIEW'` y `previewData`.
- Devolver `{ batch, rows }`.

- [ ] **Step 5: Implementar confirmacion transaccional**

`confirmImport(batchId)` debe:

- Buscar lote `PREVIEW`.
- Rechazar si no existe o ya esta confirmado.
- Leer `previewData`.
- Insertar solo filas `VALID` o `WARNING` que no existan.
- Para ventas: crear `incomeRecord`.
- Para compras: crear `expenseRecord`.
- Para cartola: crear `bankTransaction`.
- Actualizar lote a `CONFIRMED`, `confirmedAt`, `rowsDuplicated`.

- [ ] **Step 6: Implementar controller**

Seguir patron del repo: parsear con Zod y responder `{ data: ... }`.

- [ ] **Step 7: Implementar routes con multer**

Instalar y configurar `multer` si no existe:

Run: `cd backend && npm install multer && npm install -D @types/multer`

Routes:

```ts
financeImportsRouter.get('/accounts', asyncHandler(listAccountsController));
financeImportsRouter.post('/accounts', asyncHandler(createAccountController));
financeImportsRouter.patch('/accounts/:id', asyncHandler(updateAccountController));
financeImportsRouter.post('/preview', upload.single('file'), asyncHandler(previewController));
financeImportsRouter.post('/confirm', asyncHandler(confirmController));
financeImportsRouter.get('/batches', asyncHandler(listBatchesController));
financeImportsRouter.get('/batches/:id', asyncHandler(getBatchController));
```

- [ ] **Step 8: Montar rutas**

En `backend/src/routes/index.ts`:

```ts
import { financeImportsRouter } from '../modules/finance-imports/finance-imports.routes';
apiRouter.use('/finance/imports', requireAuth, financeImportsRouter);
```

- [ ] **Step 9: Build backend**

Run: `cd backend && npm run build`  
Expected: PASS.

- [ ] **Step 10: Tests parser**

Run: `cd backend && npx tsx --test tests/finance-imports.parser.test.ts`  
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/routes/index.ts backend/src/modules/finance-imports
git commit -m "feat: agrega backend de importacion financiera"
```

---

## Chunk 4: Frontend de importaciones

### Task 6: Soportar multipart en cliente API

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Escribir helper `postForm`**

Agregar a `api`:

```ts
postForm: <T>(path: string, formData: FormData) =>
  request<T>(path, {
    method: 'POST',
    body: formData,
    headers: {},
  }),
```

- [ ] **Step 2: Ajustar `request` para FormData**

Cambiar headers:

```ts
const isFormData = options.body instanceof FormData;
headers: isFormData
  ? { ...options.headers }
  : { 'Content-Type': 'application/json', ...options.headers },
```

- [ ] **Step 3: Lint frontend**

Run: `cd frontend && npm run lint`  
Expected: PASS.

### Task 7: Crear hooks de importacion

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Agregar tipos auxiliares**

```ts
export type ImportPreviewInput = {
  organizationId: string;
  bankAccountId?: string;
  type: FinancialImportType;
  periodMonth: string;
  file: File;
};
```

- [ ] **Step 2: Agregar queries/mutations**

Implementar:

- `useBankAccounts(organizationId?: string)`
- `useCreateBankAccount()`
- `useUpdateBankAccount()`
- `useFinanceImportBatches(organizationId?: string)`
- `useFinanceImportPreview()`
- `useConfirmFinanceImport()`

Preview crea `FormData` con `organizationId`, `type`, `periodMonth`, `bankAccountId` si existe y `file`.

- [ ] **Step 3: Invalidar queries**

Al crear cuenta: invalidar `finance-imports`.  
Al confirmar: invalidar `income`, `expenses`, `finance`, `dashboard`, `finance-imports`.

- [ ] **Step 4: Lint frontend**

Run: `cd frontend && npm run lint`  
Expected: PASS.

### Task 8: Crear UI de Importaciones

**Files:**
- Create: `frontend/src/pages/finance/FinanceImportsTab.tsx`
- Modify: `frontend/src/pages/finance/FinancePage.tsx`

- [ ] **Step 1: Agregar tab**

En `FinancePage.tsx`, extender:

```ts
type Tab = 'summary' | 'income' | 'expenses' | 'imports';
{ id: 'imports', label: 'Importaciones' }
```

Render:

```tsx
{tab === 'imports' && <FinanceImportsTab organizationId={organizationId} />}
```

- [ ] **Step 2: Crear formulario de preview**

`FinanceImportsTab` debe mostrar:

- Mensaje si no hay empresa seleccionada.
- Input `month`.
- Select de tipo.
- Select de cuenta cuando tipo sea cartola.
- Input file.
- Boton `Vista previa`.

- [ ] **Step 3: Crear alta simple de cuenta bancaria**

Dentro de la misma pestana, permitir crear cuenta con:

- Nombre.
- Banco.
- Numero de cuenta.

- [ ] **Step 4: Renderizar preview**

Mostrar cards:

- Filas validas.
- Duplicadas.
- Total ingresos.
- Total gastos.
- Total cargos.
- Total abonos.

Tabla con primeras 50 filas: estado, descripcion, contraparte, fecha, monto/cargo/abono, advertencias.

- [ ] **Step 5: Confirmar importacion**

Boton `Confirmar importacion` llama `useConfirmFinanceImport` con `batchId`. Al terminar, limpiar preview y mostrar feedback.

- [ ] **Step 6: Historial**

Mostrar ultimos lotes con periodo, tipo, estado, archivo, filas y fecha de confirmacion.

- [ ] **Step 7: Lint frontend**

Run: `cd frontend && npm run lint`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useFinance.ts frontend/src/pages/finance/FinancePage.tsx frontend/src/pages/finance/FinanceImportsTab.tsx frontend/src/types/domain.ts
git commit -m "feat: agrega UI de importaciones financieras"
```

---

## Chunk 5: Verificacion integral y cierre

### Task 9: Verificar con archivos reales

**Files:**
- No editar salvo fixes necesarios.

- [ ] **Step 1: Ejecutar parser tests**

Run: `cd backend && npx tsx --test tests/finance-imports.parser.test.ts`  
Expected: PASS.

- [ ] **Step 2: Build backend**

Run: `cd backend && npm run build`  
Expected: PASS.

- [ ] **Step 3: Lint frontend**

Run: `cd frontend && npm run lint`  
Expected: PASS.

- [ ] **Step 4: Probar preview manual**

Con backend/frontend corriendo, ingresar a `/finanzas`, elegir empresa, ir a `Importaciones`, subir:

- `C:\Users\alexi\Downloads\CENTROMEDICOVITAM_REPORTE_VENTA_20260622202749.xlsx`
- `C:\Users\alexi\Downloads\CENTROMEDICOVITAM_REPORTE_COMPRA_20260622202813.xlsx`
- `C:\Users\alexi\Downloads\cartola.xls`

Expected:

- Ventas muestra ingresos y total aproximado del resumen.
- Compras muestra gastos y total aproximado del resumen.
- Cartola muestra cargos/abonos y exige cuenta bancaria.

- [ ] **Step 5: Confirmar una importacion por tipo en base local**

Expected:

- Ventas crea `IncomeRecord`.
- Compras crea `ExpenseRecord`.
- Cartola crea `BankTransaction`.
- Repetir preview/confirmacion del mismo archivo marca duplicados y no duplica.

- [ ] **Step 6: Revisar estado git**

Run: `git status --short`  
Expected: solo cambios propios o limpio, ignorando `AGENTS.md` si sigue sin trackear.

- [ ] **Step 7: Commit final de fixes**

Si hubo ajustes:

```bash
git add <files>
git commit -m "fix: ajusta importacion financiera mensual"
```

## Notas de ejecucion

- No abrir `cartola.xls` con Excel/COM.
- Mantener mensajes de API y UI en espanol.
- No exponer archivos ni API keys al frontend.
- No implementar conciliacion automatica en esta fase.
- Si `npm install` requiere red, solicitar aprobacion escalada por acceso a red.
