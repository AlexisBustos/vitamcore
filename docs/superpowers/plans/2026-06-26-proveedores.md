# Módulo Proveedores — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo Proveedores (espejo de Clientes): entidad `Vendor`, creación automática al importar compras, `vendorId` en cada gasto, y página Proveedores con detalle.

**Architecture:** Backend (Express + Prisma + Zod) replica el módulo `clients`: modelo `Vendor`, `upsertVendor` en la importación, módulo `vendors` (list+stats, get+expenses). Frontend replica las páginas de Clientes. Migración con backfill de proveedores desde gastos ya importados.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL 16), Zod, React, Vite, TanStack Query, React Router, Tailwind v4.

**Verificación:** Sin framework de tests. Backend `cd backend && npm run build` (tsc); frontend `cd frontend && npm run build`/`npm run lint`; más prueba manual.

**Spec:** `docs/superpowers/specs/2026-06-26-proveedores-design.md`

---

## File Structure

**Backend**
- `prisma/schema.prisma` — modelo `Vendor`, `vendorId` en `ExpenseRecord`, `vendors` en `Organization`.
- `prisma/migrations/<ts>_vendors/migration.sql` — tabla + columna + backfill.
- `src/modules/finance-imports/finance-imports.service.ts` — `upsertVendor` + wire en compras.
- `src/modules/vendors/vendors.{schema,service,controller,routes}.ts` — nuevos.
- `src/routes/index.ts` — montar `vendorsRouter`.

**Frontend**
- `src/types/domain.ts` — `vendorId` en `ExpenseRecord`; `Vendor`/`VendorStats`/`VendorDetail`.
- `src/hooks/useFinance.ts` — invalidar `['vendors']`.
- `src/hooks/useVendors.ts` — nuevo.
- `src/pages/vendors/VendorsPage.tsx`, `VendorDetailPage.tsx` — nuevos.
- `src/App.tsx`, `src/lib/nav.ts`, `src/pages/finance/PayablesTab.tsx`.

---

## Chunk 1: Backend

### Task 1: Modelo `Vendor` + `vendorId` + migración con backfill

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<ts>_vendors/migration.sql` (generado + editado)

- [ ] **Step 1: Agregar el modelo `Vendor`**

En `schema.prisma`, después del bloque del modelo `Client` (termina en `@@map("clients")`),
agrega:

```prisma
/// Proveedor (razón social + RUT) consolidado por empresa.
/// Se crea/actualiza automáticamente al importar reportes de compras.
/// Los acumulados NO se almacenan: se calculan agregando sus ExpenseRecord.
model Vendor {
  id             String   @id @default(cuid())
  organizationId String
  rut            String
  name           String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  expenses     ExpenseRecord[]

  @@unique([organizationId, rut])
  @@index([organizationId])
  @@map("vendors")
}
```

- [ ] **Step 2: Agregar `vendorId` y la relación a `ExpenseRecord`**

En el modelo `ExpenseRecord`, agrega el campo `vendorId` después de `importBatchId String?`:

```prisma
  importBatchId       String?
  vendorId            String?
  vendorName          String?
```

Agrega la relación después de la relación `importBatch`:

```prisma
  importBatch  FinancialImportBatch? @relation(fields: [importBatchId], references: [id], onDelete: SetNull)
  vendor       Vendor?               @relation(fields: [vendorId], references: [id], onDelete: SetNull)
```

Y agrega el índice (anclaje único por `@@map("expense_records")`). Reemplaza:

```prisma
  @@index([sourceIssueDate])
  @@map("expense_records")
```

por:

```prisma
  @@index([sourceIssueDate])
  @@index([vendorId])
  @@map("expense_records")
```

- [ ] **Step 3: Agregar la relación inversa en `Organization`**

En el modelo `Organization`, junto a la relación `clients Client[]`, agrega
`vendors Vendor[]` (respeta el formato/alineación del archivo).

- [ ] **Step 4: Generar la migración sin aplicar**

Run: `cd backend && npx prisma migrate dev --name vendors --create-only`
Expected: crea `prisma/migrations/<timestamp>_vendors/migration.sql` con `CREATE TABLE
"vendors"`, su índice único, `ALTER TABLE "expense_records" ADD COLUMN "vendorId"`, índice
y FK. No aplica aún.

- [ ] **Step 5: Anexar el backfill al `migration.sql` generado**

Al final del `migration.sql` recién creado, agrega:

```sql

-- Crear proveedores a partir de gastos ya importados (uno por empresa+RUT).
INSERT INTO "vendors" ("id", "organizationId", "rut", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."organizationId", e."sourceRut",
       COALESCE(MAX(e."vendorName"), e."sourceRut"), now(), now()
FROM "expense_records" e
WHERE e."sourceRut" IS NOT NULL AND e."sourceRut" <> ''
GROUP BY e."organizationId", e."sourceRut"
ON CONFLICT ("organizationId", "rut") DO NOTHING;

-- Enlazar cada gasto con su proveedor.
UPDATE "expense_records" e
SET "vendorId" = v."id"
FROM "vendors" v
WHERE v."organizationId" = e."organizationId"
  AND v."rut" = e."sourceRut"
  AND e."vendorId" IS NULL
  AND e."sourceRut" IS NOT NULL AND e."sourceRut" <> '';
```

- [ ] **Step 6: Aplicar y regenerar el cliente**

Run: `cd backend && npx prisma migrate deploy && npx prisma generate`
Expected: aplica la migración `<ts>_vendors` y regenera el cliente (ahora existe
`prisma.vendor` y `ExpenseRecord.vendorId`).

- [ ] **Step 7: Verificar el backfill**

Run:
```bash
docker exec vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT (SELECT count(*) FROM vendors) AS proveedores, (SELECT count(*) FROM expense_records WHERE \"vendorId\" IS NOT NULL) AS gastos_enlazados;"
```
Expected: ambos > 0 (proveedores creados y gastos enlazados).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: modelo Vendor y vendorId en gastos con backfill"
```

---

### Task 2: `upsertVendor` en la importación de compras

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts`

- [ ] **Step 1: Agregar `upsertVendor`**

Justo después de la función `upsertClient` (que termina con `return client.id; }`), agrega:

```ts
async function upsertVendor(
  tx: Prisma.TransactionClient,
  organizationId: string,
  rut: string,
  name: string | null,
) {
  const vendor = await tx.vendor.upsert({
    where: { organizationId_rut: { organizationId, rut } },
    create: { organizationId, rut, name: name ?? rut },
    update: name ? { name } : {},
    select: { id: true },
  });
  return vendor.id;
}
```

- [ ] **Step 2: Enlazar el proveedor al crear el gasto**

Reemplaza el bloque `PURCHASE_REPORT`:

```ts
    if (batch.type === FinancialImportType.PURCHASE_REPORT) {
      await tx.expenseRecord.create({
        data: {
          organizationId: batch.organizationId,
          importBatchId: batch.id,
          vendorName: stringOrNull(row.data.vendorName),
          description: stringOrDefault(row.data.description, 'Gasto importado'),
          amount: numberOrDefault(row.data.amount),
          currency: stringOrDefault(row.data.currency, 'CLP'),
          category: stringOrNull(row.data.category),
          status: stringOrDefault(row.data.status, 'PENDING') as never,
          expenseDate: dateOrNull(row.data.expenseDate),
          dueDate: dateOrNull(row.data.dueDate),
          sourceDocumentType: stringOrNull(row.data.sourceDocumentType),
          sourceFolio: stringOrNull(row.data.sourceFolio),
          sourceRut: stringOrNull(row.data.sourceRut),
          sourceIssueDate: dateOrNull(row.data.sourceIssueDate),
          sourceDedupeKey: row.dedupeKey,
          rawData: row.rawData,
        },
      });
      return true;
    }
```

por:

```ts
    if (batch.type === FinancialImportType.PURCHASE_REPORT) {
      const vendorName = stringOrNull(row.data.vendorName);
      const rut = stringOrNull(row.data.sourceRut);
      const vendorId = rut
        ? await upsertVendor(tx, batch.organizationId, rut, vendorName)
        : null;
      await tx.expenseRecord.create({
        data: {
          organizationId: batch.organizationId,
          importBatchId: batch.id,
          vendorId,
          vendorName,
          description: stringOrDefault(row.data.description, 'Gasto importado'),
          amount: numberOrDefault(row.data.amount),
          currency: stringOrDefault(row.data.currency, 'CLP'),
          category: stringOrNull(row.data.category),
          status: stringOrDefault(row.data.status, 'PENDING') as never,
          expenseDate: dateOrNull(row.data.expenseDate),
          dueDate: dateOrNull(row.data.dueDate),
          sourceDocumentType: stringOrNull(row.data.sourceDocumentType),
          sourceFolio: stringOrNull(row.data.sourceFolio),
          sourceRut: rut,
          sourceIssueDate: dateOrNull(row.data.sourceIssueDate),
          sourceDedupeKey: row.dedupeKey,
          rawData: row.rawData,
        },
      });
      return true;
    }
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/finance-imports/finance-imports.service.ts
git commit -m "feat: la importacion de compras crea/enlaza proveedores"
```

---

### Task 3: Módulo `vendors` — schema y service

**Files:**
- Create: `backend/src/modules/vendors/vendors.schema.ts`
- Create: `backend/src/modules/vendors/vendors.service.ts`

- [ ] **Step 1: Crear `vendors.schema.ts`**

```ts
import { z } from 'zod';

export const listVendorsQuery = z.object({
  organizationId: z.string().optional(),
  search: z.string().trim().optional(),
});

export type ListVendorsFilters = z.infer<typeof listVendorsQuery>;
```

- [ ] **Step 2: Crear `vendors.service.ts`**

```ts
import { ExpenseStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/http-error';
import type { ListVendorsFilters } from './vendors.schema';

const orgRef = { select: { id: true, name: true } };

// Campos mínimos de cada gasto necesarios para calcular acumulados.
const statsSelect = {
  amount: true,
  status: true,
  paidDate: true,
  sourceIssueDate: true,
  expenseDate: true,
} as const;

type ExpenseStatsRow = {
  amount: number;
  status: ExpenseStatus;
  paidDate: Date | null;
  sourceIssueDate: Date | null;
  expenseDate: Date | null;
};

/// Acumulados derivados (no se almacenan): se calculan agregando los gastos del
/// proveedor. Los gastos anulados (CANCELLED) se excluyen de los totales.
function computeStats(expenses: ExpenseStatsRow[]) {
  let totalSpent = 0;
  let paidAmount = 0;
  let lastDocumentDate: Date | null = null;

  for (const exp of expenses) {
    if (exp.status !== ExpenseStatus.CANCELLED) {
      totalSpent += exp.amount ?? 0;
      if (exp.paidDate) paidAmount += exp.amount ?? 0;
    }
    const date = exp.sourceIssueDate ?? exp.expenseDate;
    if (date && (!lastDocumentDate || date > lastDocumentDate)) {
      lastDocumentDate = date;
    }
  }

  return {
    totalSpent,
    paidAmount,
    pendingAmount: totalSpent - paidAmount,
    documentCount: expenses.length,
    lastDocumentDate,
  };
}

export async function listVendors(filters: ListVendorsFilters) {
  const vendors = await prisma.vendor.findMany({
    where: {
      organizationId: filters.organizationId,
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { rut: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
    include: {
      organization: orgRef,
      expenses: { select: statsSelect },
    },
  });

  return vendors.map(({ expenses, ...vendor }) => ({
    ...vendor,
    stats: computeStats(expenses),
  }));
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      organization: orgRef,
      expenses: {
        orderBy: [{ sourceIssueDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      },
    },
  });
  if (!vendor) throw notFound('Proveedor no encontrado');

  return {
    ...vendor,
    stats: computeStats(vendor.expenses),
  };
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/vendors/vendors.schema.ts backend/src/modules/vendors/vendors.service.ts
git commit -m "feat: schema y service de proveedores"
```

---

### Task 4: Módulo `vendors` — controller, rutas y montaje

**Files:**
- Create: `backend/src/modules/vendors/vendors.controller.ts`
- Create: `backend/src/modules/vendors/vendors.routes.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Crear `vendors.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { listVendorsQuery } from './vendors.schema';
import * as service from './vendors.service';

export async function listVendorsController(req: Request, res: Response) {
  const filters = listVendorsQuery.parse(req.query);
  res.json({ data: await service.listVendors(filters) });
}

export async function getVendorController(req: Request, res: Response) {
  res.json({ data: await service.getVendor(req.params.id) });
}
```

- [ ] **Step 2: Crear `vendors.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getVendorController, listVendorsController } from './vendors.controller';

export const vendorsRouter = Router();

vendorsRouter.get('/', asyncHandler(listVendorsController));
vendorsRouter.get('/:id', asyncHandler(getVendorController));
```

- [ ] **Step 3: Montar el router**

En `src/routes/index.ts`, agrega el import junto al de clients:

```ts
import { vendorsRouter } from '../modules/vendors/vendors.routes';
```

Y el montaje junto al de `/clients`:

```ts
apiRouter.use('/vendors', requireAuth, vendorsRouter);
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendors/vendors.controller.ts backend/src/modules/vendors/vendors.routes.ts backend/src/routes/index.ts
git commit -m "feat: controller, rutas y montaje de proveedores"
```

---

## Chunk 2: Frontend

### Task 5: Tipos + invalidación de `['vendors']`

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: `vendorId` en `ExpenseRecord`**

En `types/domain.ts`, en la interfaz `ExpenseRecord`, agrega (junto a `paidDate`/`sourceFolio`):

```ts
  vendorId: string | null;
```

- [ ] **Step 2: Tipos de proveedor**

En `types/domain.ts`, después del bloque de `ClientDetail`, agrega:

```ts
export interface VendorStats {
  totalSpent: number;
  paidAmount: number;
  pendingAmount: number;
  documentCount: number;
  lastDocumentDate: string | null;
}

export interface Vendor {
  id: string;
  organizationId: string;
  rut: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  stats: VendorStats;
}

export interface VendorDetail extends Vendor {
  expenses: ExpenseRecord[];
}
```

(`Ref` ya existe en el archivo, lo usa `Client`.)

- [ ] **Step 3: Invalidar `['vendors']`**

En `useFinance.ts`, dentro de `invalidateFinance`, agrega una línea más:

```ts
  qc.invalidateQueries({ queryKey: ['vendors'] });
```

(Como `useConfirmFinanceImport` y `useRegisterExpensePayment` ya llaman a
`invalidateFinance`, esto refresca proveedores tras importar compras o marcar pagado.)

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/hooks/useFinance.ts
git commit -m "feat: tipos de proveedor y vendorId en gastos"
```

---

### Task 6: Hook `useVendors`

**Files:**
- Create: `frontend/src/hooks/useVendors.ts`

- [ ] **Step 1: Crear el hook (espejo de `useClients`)**

```ts
import { useQuery } from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type { Vendor, VendorDetail } from '@/types/domain';

export type VendorFilters = {
  organizationId?: string;
  search?: string;
};

export function useVendors(filters: VendorFilters = {}) {
  return useQuery({
    queryKey: ['vendors', 'list', filters],
    queryFn: () =>
      api
        .get<{ data: Vendor[] }>(`/vendors${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useVendorDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['vendors', 'detail', id],
    enabled: !!id,
    queryFn: () =>
      api.get<{ data: VendorDetail }>(`/vendors/${id}`).then((r) => r.data),
  });
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useVendors.ts
git commit -m "feat: hook useVendors"
```

---

### Task 7: `VendorsPage`

**Files:**
- Create: `frontend/src/pages/vendors/VendorsPage.tsx`

- [ ] **Step 1: Crear la página (espejo de `ClientsPage`)**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useVendors, type VendorFilters } from '@/hooks/useVendors';

export function VendorsPage() {
  const [filters, setFilters] = useState<VendorFilters>({});
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useVendors(filters);

  function set(key: keyof VendorFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  const totalSpent = (data ?? []).reduce((sum, v) => sum + v.stats.totalSpent, 0);
  const totalPending = (data ?? []).reduce(
    (sum, v) => sum + v.stats.pendingAmount,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description="Cartera consolidada por empresa, generada al importar compras."
      />

      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            title="Proveedores"
            value={String(data.length)}
            icon={Truck}
          />
          <MetricCard title="Total gastado" value={formatMoney(totalSpent)} />
          <MetricCard
            title="Pendiente"
            value={formatMoney(totalPending)}
            tone={totalPending > 0 ? 'warning' : 'default'}
          />
        </div>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Input
            placeholder="Buscar por razón social o RUT"
            value={filters.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && data.length === 0 && (
        <EmptyState title="Sin proveedores">
          Aún no hay proveedores. Se crean automáticamente al importar reportes de
          compras en Finanzas → Importaciones.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 text-right font-medium">Documentos</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Total gastado
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-3 font-medium">Último documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => navigate(`/proveedores/${v.id}`)}
                    onKeyDown={(e) =>
                      (e.key === 'Enter' || e.key === ' ') &&
                      navigate(`/proveedores/${v.id}`)
                    }
                    tabIndex={0}
                    className="cursor-pointer hover:bg-[var(--color-muted)]/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {v.name}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {v.rut}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {v.organization?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.stats.documentCount}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(v.stats.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)]">
                      {v.stats.pendingAmount
                        ? formatMoney(v.stats.pendingAmount)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatDate(v.stats.lastDocumentDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/vendors/VendorsPage.tsx
git commit -m "feat: pagina Proveedores"
```

---

### Task 8: `VendorDetailPage` (solo lectura)

**Files:**
- Create: `frontend/src/pages/vendors/VendorDetailPage.tsx`

- [ ] **Step 1: Crear la página (espejo de `ClientDetailPage`, sin acción de pago)**

```tsx
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useVendorDetail } from '@/hooks/useVendors';
import type { ExpenseRecord } from '@/types/domain';

type EstadoPago = 'paid' | 'overdue' | 'pending' | 'cancelled';

const ESTADO_LABEL: Record<EstadoPago, string> = {
  paid: 'Pagado',
  overdue: 'Vencido',
  pending: 'Pendiente',
  cancelled: 'Anulado',
};

const ESTADO_CLASS: Record<EstadoPago, string> = {
  paid: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  overdue: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  pending: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  cancelled: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

// Estado de pago derivado, alineado con expenses.service.ts (paymentState).
function estadoPago(exp: ExpenseRecord): EstadoPago {
  if (exp.status === 'CANCELLED') return 'cancelled';
  if (exp.paidDate) return 'paid';
  if (exp.dueDate && new Date(exp.dueDate) < new Date()) return 'overdue';
  return 'pending';
}

export function VendorDetailPage() {
  const { id } = useParams();
  const { data: vendor, isLoading, isError, error } = useVendorDetail(id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/proveedores"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a proveedores
        </Link>
      </div>

      {isLoading && <Spinner label="Cargando proveedor…" />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {vendor && (
        <>
          <PageHeader
            title={vendor.name}
            description={`${vendor.rut} · ${vendor.organization?.name ?? '—'}`}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total gastado"
              value={formatMoney(vendor.stats.totalSpent)}
            />
            <MetricCard title="Pagado" value={formatMoney(vendor.stats.paidAmount)} />
            <MetricCard
              title="Pendiente"
              value={formatMoney(vendor.stats.pendingAmount)}
              tone={vendor.stats.pendingAmount > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              title="Documentos"
              value={String(vendor.stats.documentCount)}
            />
          </div>

          {vendor.expenses.length === 0 ? (
            <EmptyState title="Sin documentos">
              Este proveedor aún no tiene gastos asociados.
            </EmptyState>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
                <FileText className="h-5 w-5 text-[var(--color-primary)]" />
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                  Documentos ({vendor.expenses.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Folio</th>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 text-right font-medium">Monto</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {vendor.expenses.map((exp) => {
                      const estado = estadoPago(exp);
                      return (
                        <tr
                          key={exp.id}
                          className="hover:bg-[var(--color-muted)]/40"
                        >
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {exp.sourceFolio ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {formatDate(exp.expenseDate ?? exp.dueDate)}
                          </td>
                          <td className="px-4 py-3">{exp.description}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatMoney(exp.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={ESTADO_CLASS[estado]}>
                              {ESTADO_LABEL[estado]}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/vendors/VendorDetailPage.tsx
git commit -m "feat: pagina de detalle de proveedor"
```

---

### Task 9: Rutas, navegación y enlace en Cuentas por pagar

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/pages/finance/PayablesTab.tsx`

- [ ] **Step 1: Rutas en `App.tsx`**

Agrega los imports junto a los de Clientes:

```tsx
import { VendorsPage } from '@/pages/vendors/VendorsPage';
import { VendorDetailPage } from '@/pages/vendors/VendorDetailPage';
```

Y las rutas después de las de `/clientes`:

```tsx
<Route path="/proveedores" element={<VendorsPage />} />
<Route path="/proveedores/:id" element={<VendorDetailPage />} />
```

- [ ] **Step 2: Item de nav en `lib/nav.ts`**

Agrega `Truck` al import de `lucide-react`, y el item después del de Clientes:

```ts
  { label: 'Clientes', path: '/clientes', icon: Users },
  { label: 'Proveedores', path: '/proveedores', icon: Truck },
```

- [ ] **Step 3: Enlace del proveedor en `PayablesTab.tsx`**

Agrega el import:

```tsx
import { Link } from 'react-router-dom';
```

Reemplaza la celda del proveedor:

```tsx
                    <td className="px-4 py-3">{r.vendorName ?? '—'}</td>
```

por:

```tsx
                    <td className="px-4 py-3">
                      {r.vendorName ? (
                        r.vendorId ? (
                          <Link
                            to={`/proveedores/${r.vendorId}`}
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {r.vendorName}
                          </Link>
                        ) : (
                          r.vendorName
                        )
                      ) : (
                        '—'
                      )}
                    </td>
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/lib/nav.ts frontend/src/pages/finance/PayablesTab.tsx
git commit -m "feat: rutas, nav y enlace de proveedores en cuentas por pagar"
```

---

## Verificación final (manual)

Tras completar los 9 tasks:

- [ ] **Typecheck backend:** `cd backend && npm run build` → PASS.
- [ ] **Typecheck/build frontend:** `cd frontend && npm run build` → PASS.
- [ ] **Prueba manual** (backend + frontend levantados):
  1. El sidebar muestra "Proveedores"; la página lista proveedores con totales (backfill).
  2. Abrir un proveedor muestra sus gastos y stats (total gastado / pagado / pendiente).
  3. En Cuentas por pagar, el nombre del proveedor enlaza a su detalle.
  4. Reimportar un libro de compras crea/actualiza proveedores y enlaza `vendorId`.
