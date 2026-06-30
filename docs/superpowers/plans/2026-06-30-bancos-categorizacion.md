# Categorización de movimientos bancarios — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clasificar cada movimiento bancario en una categoría (híbrido: reglas automáticas + override manual), con un desglose por categoría y la categoría visible/filtrable en la tabla de movimientos.

**Architecture:** Un categorizador puro (`categorize(description, isCharge)`) es la única fuente de verdad, usado al importar y en un script de backfill. `BankTransaction` gana `category` + `categoryManual`. Dos endpoints nuevos (desglose `by-category`, override `PATCH .../:id/category`) en el módulo `finance-imports`. El frontend agrega presentación de categorías en `lib/domain.ts`, un componente de desglose y la columna/filtro/override en `BanksTab.tsx`.

**Tech Stack:** Express + Prisma (`$queryRaw` + migración), Zod, React + Vite + TanStack Query, Tailwind v4. **Sin framework de tests**: verificación = typecheck (`backend: npm run build`, `frontend: npm run lint`) + backfill + prueba manual.

**Spec:** `docs/superpowers/specs/2026-06-30-bancos-categorizacion-design.md`

---

## Estructura de archivos

**Backend** (`backend/`):
- `prisma/schema.prisma` — **Modificar**: `category` + `categoryManual` en `BankTransaction`.
- `prisma/migrations/<ts>_bank_transaction_category/` — **Crear** (vía `prisma migrate dev`).
- `src/modules/finance-imports/finance-imports.categories.ts` — **Crear**: categorías + reglas + `categorize`.
- `prisma/scripts/categorize-backfill.ts` — **Crear**: backfill idempotente.
- `package.json` — **Modificar**: script `prisma:categorize`.
- `src/modules/finance-imports/finance-imports.service.ts` — **Modificar**: hook en `createRow`, `listBankByCategory`, `setTransactionCategory`, filtro `category` en `listBankTransactions`.
- `finance-imports.schema.ts` — **Modificar**: `category` en `listTransactionsQuery`, `listByCategoryQuery`, `setCategorySchema`.
- `finance-imports.controller.ts` — **Modificar**: `listByCategoryController`, `setCategoryController`.
- `finance-imports.routes.ts` — **Modificar**: rutas `by-category` y `:id/category`.

**Frontend** (`frontend/src/`):
- `lib/domain.ts` — **Modificar**: `bankCategory`/`bankCategoryType`/`bankCategoryLabel`/`bankCategoryOptions`.
- `types/domain.ts` — **Modificar**: campos en `BankTransaction` + `BankCategoryBreakdown`.
- `hooks/useFinance.ts` — **Modificar**: `useBankByCategory`, `useSetTransactionCategory`, `category` en filtros.
- `pages/finance/BankCategoryBreakdown.tsx` — **Crear**: sección "De dónde entra / a dónde va".
- `pages/finance/BanksTab.tsx` — **Modificar**: render del desglose + columna/filtro/override.

**Nota:** rama `develop`. `git add` con **rutas explícitas** siempre.

---

## Chunk 1: Backend — categorizador, esquema, import, backfill

### Task 1: Categorizador (única fuente de verdad)

**Files:**
- Create: `backend/src/modules/finance-imports/finance-imports.categories.ts`

- [ ] **Step 1: Crear el archivo** con exactamente este contenido:

```ts
// Categorías de movimientos bancarios + reglas de clasificación automática.
// Única fuente de verdad: la usa el import (createRow) y el backfill.

// Tupla `const` (NO string[]): z.enum exige una tupla no vacía.
export const BANK_CATEGORIES = [
  'TRASPASO_INTERNO',
  'FONASA',
  'VENTAS',
  'TRANSFER_IN',
  'COMBUSTIBLE',
  'CREDITOS',
  'IMPUESTOS',
  'COMISIONES',
  'HONORARIOS',
  'PROVEEDORES',
] as const;

export type BankCategory = (typeof BANK_CATEGORIES)[number];
export type BankCategoryType = 'INCOME' | 'EXPENSE' | 'NEUTRAL';

export const BANK_CATEGORY_TYPE: Record<BankCategory, BankCategoryType> = {
  TRASPASO_INTERNO: 'NEUTRAL',
  FONASA: 'INCOME',
  VENTAS: 'INCOME',
  TRANSFER_IN: 'INCOME',
  COMBUSTIBLE: 'EXPENSE',
  CREDITOS: 'EXPENSE',
  IMPUESTOS: 'EXPENSE',
  COMISIONES: 'EXPENSE',
  HONORARIOS: 'EXPENSE',
  PROVEEDORES: 'EXPENSE',
};

// Reglas ordenadas; la primera que calza gana. `when` opcional restringe por dirección.
type Rule = {
  category: BankCategory;
  when?: 'charge' | 'credit';
  test: (d: string) => boolean;
};

const RULES: Rule[] = [
  {
    category: 'TRASPASO_INTERNO',
    test: (d) =>
      d.startsWith('traspaso a cuenta:') || d.startsWith('traspaso de cuenta:'),
  },
  { category: 'FONASA', test: (d) => d.includes('fonasa') },
  {
    category: 'VENTAS',
    test: (d) =>
      d.startsWith('deposito en efectivo') || d.includes('banchile pagos'),
  },
  { category: 'TRANSFER_IN', test: (d) => d.startsWith('traspaso de:') },
  { category: 'COMBUSTIBLE', test: (d) => d.includes('copec') },
  { category: 'CREDITOS', test: (d) => d.includes('pago de credito') },
  {
    category: 'IMPUESTOS',
    test: (d) =>
      d.includes('sii') ||
      d.includes('tesoreria') ||
      d.includes('ppm') ||
      d.includes(' iva') ||
      d.includes('impto'),
  },
  {
    category: 'COMISIONES',
    test: (d) =>
      d.includes('comision') ||
      d.includes('mantencion') ||
      d.includes('impuesto cheques'),
  },
  { category: 'HONORARIOS', test: (d) => d.startsWith('traspaso a:') },
  { category: 'PROVEEDORES', when: 'charge', test: (d) => d.startsWith('pago:') },
];

/// Clasifica un movimiento. Devuelve null ("Sin categoría / Otros") si nada calza.
export function categorize(
  description: string,
  isCharge: boolean,
): BankCategory | null {
  const d = description.trim().toLowerCase();
  for (const r of RULES) {
    if (r.when === 'charge' && !isCharge) continue;
    if (r.when === 'credit' && isCharge) continue;
    if (r.test(d)) return r.category;
  }
  return null;
}
```

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila (el archivo aún no se importa en ningún lado, pero debe typechear).

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.categories.ts && git commit -m "feat: categorizador de movimientos bancarios (reglas + categorize)"
```

### Task 2: Esquema + migración

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<ts>_bank_transaction_category/migration.sql` (generado)

- [ ] **Step 1: Editar `model BankTransaction`** — agregar dos campos (después de `balance Int?` o junto a los escalares) y un índice:
```prisma
  category       String?
  categoryManual Boolean  @default(false)
```
y dentro del bloque de índices del modelo:
```prisma
  @@index([category])
```

- [ ] **Step 2: Generar y aplicar la migración**
```bash
cd /c/Workspace/Code/vitamcore/backend && npx prisma migrate dev --name bank_transaction_category
```
Expected: crea la carpeta de migración, aplica las columnas, regenera el cliente. (Postgres corriendo vía `docker compose up -d`.)

- [ ] **Step 3: Typecheck** — `npm run build`. Expected: compila (el cliente Prisma ya conoce `category`/`categoryManual`).

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/prisma/schema.prisma backend/prisma/migrations && git commit -m "feat: columnas category/categoryManual en bank_transactions"
```

### Task 3: Categorizar al importar

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts`

- [ ] **Step 1: Importar `categorize`** — junto a los imports del módulo (arriba del archivo):
```ts
import { categorize } from './finance-imports.categories';
```

- [ ] **Step 2: Hook en `createRow`** — en la rama banco (`tx.bankTransaction.create`), dentro del objeto `data`, agregar (junto a `chargeAmount`/`creditAmount`):
```ts
        category: categorize(
          stringOrDefault(row.data.description, 'Movimiento importado'),
          numberOrDefault(row.data.chargeAmount) > 0,
        ),
```
(`categoryManual` queda en su default `false`. Usa los mismos helpers `stringOrDefault`/`numberOrDefault` ya presentes en el archivo.)

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.service.ts && git commit -m "feat: categorizar movimientos al confirmar la importación"
```

### Task 4: Backfill de los 681

**Files:**
- Create: `backend/prisma/scripts/categorize-backfill.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Crear el script**:
```ts
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
```

- [ ] **Step 2: Agregar el script npm** — en `backend/package.json`, dentro de `"scripts"`:
```json
    "prisma:categorize": "tsx prisma/scripts/categorize-backfill.ts",
```

- [ ] **Step 3: Correr el backfill**
```bash
cd /c/Workspace/Code/vitamcore/backend && npm run prisma:categorize
```
Expected: imprime `Categorizados 681 movimientos.` (o el total actual).

- [ ] **Step 4: Verificar la distribución**
```bash
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT COALESCE(category,'(null)') AS categoria, count(*) FROM bank_transactions GROUP BY category ORDER BY count(*) DESC;"
```
Expected: `TRASPASO_INTERNO` ~66, `HONORARIOS` con muchas filas, etc.; algunas `(null)`.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/prisma/scripts/categorize-backfill.ts backend/package.json && git commit -m "feat: script de backfill de categorización (prisma:categorize)"
```

---

## Chunk 2: Backend — endpoints

### Task 5: Schemas

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.schema.ts`

- [ ] **Step 1: Importar las categorías** — arriba del archivo:
```ts
import { BANK_CATEGORIES } from './finance-imports.categories';
```

- [ ] **Step 2: Agregar `category` a `listTransactionsQuery`** — dentro del objeto, junto a `search`:
```ts
  category: z.string().optional(),
```

- [ ] **Step 3: Agregar dos schemas nuevos** (después de `listTransactionsQuery`):
```ts
export const listByCategoryQuery = listTransactionsQuery.pick({
  organizationId: true,
  bankAccountId: true,
  month: true,
});

export const setCategorySchema = z.object({
  category: z.enum(BANK_CATEGORIES).nullable(),
});
```

- [ ] **Step 4: Exportar tipos** — junto a los otros `export type`:
```ts
export type ListByCategoryFilters = z.infer<typeof listByCategoryQuery>;
export type SetCategoryInput = z.infer<typeof setCategorySchema>;
```

- [ ] **Step 5: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 6: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.schema.ts && git commit -m "feat: schemas de desglose por categoría y override"
```

### Task 6: Service — desglose, override, filtro

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts`

- [ ] **Step 1: Filtro `category` en `listBankTransactions`** — en la construcción del `where`, después del bloque de `search`, agregar:
```ts
  if (filters.category) {
    where.category = filters.category === '__none__' ? null : filters.category;
  }
```

- [ ] **Step 2: `listBankByCategory`** — agregar (junto a `listBankMonthly`). Nota: el mes se construye como rango `transactionDate` **dentro** del `Prisma.sql` (no existe en `listBankMonthly`):
```ts
export async function listBankByCategory(filters: {
  organizationId?: string;
  bankAccountId?: string;
  month?: string;
}) {
  const conditions = [Prisma.sql`1 = 1`];
  if (filters.organizationId) {
    conditions.push(Prisma.sql`"organizationId" = ${filters.organizationId}`);
  }
  if (filters.bankAccountId) {
    conditions.push(Prisma.sql`"bankAccountId" = ${filters.bankAccountId}`);
  }
  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    conditions.push(
      Prisma.sql`"transactionDate" >= ${start} AND "transactionDate" < ${end}`,
    );
  }
  const rows = await prisma.$queryRaw<
    { category: string | null; credits: bigint; charges: bigint; count: bigint }[]
  >(Prisma.sql`
    SELECT category,
           SUM("creditAmount")::bigint AS credits,
           SUM("chargeAmount")::bigint AS charges,
           count(*)::bigint AS count
    FROM "bank_transactions"
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY category
  `);
  return rows.map((r) => ({
    category: r.category,
    credits: Number(r.credits),
    charges: Number(r.charges),
    count: Number(r.count),
  }));
}
```

- [ ] **Step 3: `setTransactionCategory`** — agregar (junto a `updateBankAccount`). Reusa `refs` (ya definido arriba del archivo) para incluir la cuenta:
```ts
export async function setTransactionCategory(
  id: string,
  category: string | null,
) {
  const current = await prisma.bankTransaction.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) throw notFound('Movimiento no encontrado');
  return prisma.bankTransaction.update({
    where: { id },
    data: { category, categoryManual: true },
    include: { bankAccount: refs.bankAccount },
  });
}
```

- [ ] **Step 4: Typecheck** — `npm run build`. Expected: compila.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.service.ts && git commit -m "feat: service de desglose por categoría, override y filtro"
```

### Task 7: Controller + rutas

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.controller.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.routes.ts`

- [ ] **Step 1: Controllers** — en `finance-imports.controller.ts`, agregar al import de schemas `listByCategoryQuery` y `setCategorySchema`, y agregar:
```ts
export async function listByCategoryController(req: Request, res: Response) {
  const filters = listByCategoryQuery.parse(req.query);
  res.json({ data: await service.listBankByCategory(filters) });
}

export async function setCategoryController(req: Request, res: Response) {
  const input = setCategorySchema.parse(req.body);
  res.json({
    data: await service.setTransactionCategory(req.params.id, input.category),
  });
}
```

- [ ] **Step 2: Rutas** — en `finance-imports.routes.ts`, agregar los dos controllers al import, y registrar:
```ts
financeImportsRouter.get(
  '/transactions/by-category',
  asyncHandler(listByCategoryController),
);
financeImportsRouter.patch(
  '/transactions/:id/category',
  asyncHandler(setCategoryController),
);
```
La `GET /transactions/by-category` debe ir **antes** de `GET /transactions` (junto a `/transactions/monthly`). La `PATCH` puede ir después (path distinto, no hay conflicto).

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.controller.ts backend/src/modules/finance-imports/finance-imports.routes.ts && git commit -m "feat: endpoints by-category y PATCH :id/category"
```

---

## Chunk 3: Frontend — presentación, hooks y UI

### Task 8: Presentación de categorías + tipos

**Files:**
- Modify: `frontend/src/lib/domain.ts`
- Modify: `frontend/src/types/domain.ts`

- [ ] **Step 1: En `lib/domain.ts`**, agregar (junto a los otros enums de presentación; reutiliza el tipo `Tone` y el helper `toOptions` ya presentes — pero ojo: `toOptions` produce `{value,label}` desde un `Record<string,Tone>`, sirve):
```ts
export type BankCategory =
  | 'TRASPASO_INTERNO' | 'FONASA' | 'VENTAS' | 'TRANSFER_IN'
  | 'COMBUSTIBLE' | 'CREDITOS' | 'IMPUESTOS' | 'COMISIONES'
  | 'HONORARIOS' | 'PROVEEDORES';

export const bankCategory: Record<BankCategory, Tone> = {
  VENTAS: { label: 'Ventas / Recaudación', className: 'bg-emerald-50 text-emerald-700' },
  FONASA: { label: 'Fonasa / Prestaciones', className: 'bg-emerald-50 text-emerald-700' },
  TRANSFER_IN: { label: 'Transferencias recibidas', className: 'bg-sky-50 text-sky-700' },
  HONORARIOS: { label: 'Honorarios / Sueldos', className: 'bg-amber-50 text-amber-700' },
  PROVEEDORES: { label: 'Proveedores', className: 'bg-orange-50 text-orange-700' },
  COMBUSTIBLE: { label: 'Combustible', className: 'bg-orange-50 text-orange-700' },
  IMPUESTOS: { label: 'Impuestos', className: 'bg-red-50 text-red-700' },
  CREDITOS: { label: 'Créditos / Deuda', className: 'bg-red-50 text-red-700' },
  COMISIONES: { label: 'Comisiones bancarias', className: 'bg-slate-100 text-slate-600' },
  TRASPASO_INTERNO: { label: 'Traspaso entre cuentas', className: 'bg-slate-100 text-slate-500' },
};

export const bankCategoryType: Record<BankCategory, 'INCOME' | 'EXPENSE' | 'NEUTRAL'> = {
  TRASPASO_INTERNO: 'NEUTRAL',
  FONASA: 'INCOME', VENTAS: 'INCOME', TRANSFER_IN: 'INCOME',
  COMBUSTIBLE: 'EXPENSE', CREDITOS: 'EXPENSE', IMPUESTOS: 'EXPENSE',
  COMISIONES: 'EXPENSE', HONORARIOS: 'EXPENSE', PROVEEDORES: 'EXPENSE',
};

/** Label de una categoría (o 'Sin categoría' si es null/desconocida). */
export function bankCategoryLabel(c: string | null): string {
  return c && c in bankCategory ? bankCategory[c as BankCategory].label : 'Sin categoría';
}

export const bankCategoryOptions = (Object.keys(bankCategory) as BankCategory[]).map(
  (value) => ({ value, label: bankCategory[value].label }),
);
```

- [ ] **Step 2: En `types/domain.ts`**, en `interface BankTransaction` agregar:
```ts
  category: string | null;
  categoryManual: boolean;
```
y agregar el tipo del desglose (junto a `BankTransactionsResponse`):
```ts
export interface BankCategoryBreakdown {
  category: string | null;
  credits: number;
  charges: number;
  count: number;
}
```

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores.

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/lib/domain.ts frontend/src/types/domain.ts && git commit -m "feat: presentación de categorías bancarias y tipos"
```

### Task 9: Hooks

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Importar el tipo** — agregar `BankCategoryBreakdown` al `import type { ... } from '@/types/domain'`.

- [ ] **Step 2: `category` en `BankTransactionFilters`** — agregar al type:
```ts
  category?: string;
```
(`useBankTransactions` ya pasa el objeto entero por `toQuery`, así que el filtro viaja solo.)

- [ ] **Step 3: Hook de desglose** — después de `useBankMonthly`:
```ts
export function useBankByCategory(filters: {
  organizationId?: string;
  bankAccountId?: string;
  month?: string;
}) {
  return useQuery({
    queryKey: ['finance-imports', 'by-category', filters],
    queryFn: () =>
      api
        .get<{ data: BankCategoryBreakdown[] }>(
          `/finance/imports/transactions/by-category${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}
```

- [ ] **Step 4: Mutación de override** — después del hook anterior:
```ts
export function useSetTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; category: string | null }) =>
      api.patch(`/finance/imports/transactions/${payload.id}/category`, {
        category: payload.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}
```

- [ ] **Step 5: Typecheck** — `npm run lint`. Expected: sin errores.

- [ ] **Step 6: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/hooks/useFinance.ts && git commit -m "feat: hooks useBankByCategory y useSetTransactionCategory"
```

### Task 10: Componente de desglose

**Files:**
- Create: `frontend/src/pages/finance/BankCategoryBreakdown.tsx`

Componente autónomo (recibe los filtros, usa el hook internamente) para no engordar `BanksTab`. Separa Ingresos/Egresos por `bankCategoryType`, reparte el grupo `null` por dirección, y muestra los traspasos internos aparte.

- [ ] **Step 1: Crear el componente**:
```tsx
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import {
  bankCategoryLabel,
  bankCategoryType,
  formatMoney,
  type BankCategory,
} from '@/lib/domain';
import { useBankByCategory } from '@/hooks/useFinance';

type Row = { key: string; label: string; amount: number };

export function BankCategoryBreakdown({
  organizationId,
  bankAccountId,
  month,
}: {
  organizationId?: string;
  bankAccountId?: string;
  month?: string;
}) {
  const query = useBankByCategory({ organizationId, bankAccountId, month });

  const { ingresos, egresos, traspasos, totalIn, totalOut } = useMemo(() => {
    const data = query.data ?? [];
    const ingresos: Row[] = [];
    const egresos: Row[] = [];
    let traspasos = 0;
    for (const r of data) {
      if (r.category === 'TRASPASO_INTERNO') {
        traspasos += r.credits + r.charges;
        continue;
      }
      if (r.category === null) {
        // Sin categoría: se reparte por dirección.
        if (r.credits > 0) ingresos.push({ key: 'null-in', label: 'Sin categoría', amount: r.credits });
        if (r.charges > 0) egresos.push({ key: 'null-out', label: 'Sin categoría', amount: r.charges });
        continue;
      }
      const type = bankCategoryType[r.category as BankCategory];
      if (type === 'INCOME') {
        ingresos.push({ key: r.category, label: bankCategoryLabel(r.category), amount: r.credits });
      } else if (type === 'EXPENSE') {
        egresos.push({ key: r.category, label: bankCategoryLabel(r.category), amount: r.charges });
      }
    }
    ingresos.sort((a, b) => b.amount - a.amount);
    egresos.sort((a, b) => b.amount - a.amount);
    const totalIn = ingresos.reduce((s, r) => s + r.amount, 0);
    const totalOut = egresos.reduce((s, r) => s + r.amount, 0);
    return { ingresos, egresos, traspasos, totalIn, totalOut };
  }, [query.data]);

  if (query.isLoading) return <Spinner label="Cargando desglose…" />;
  if (!query.data || query.data.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          De dónde entra / a dónde va
        </h3>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Por categoría, según los filtros activos. Los traspasos entre cuentas no
          cuentan como ingreso ni gasto real.
        </p>
      </div>
      <div className="grid gap-0 sm:grid-cols-2 sm:divide-x divide-[var(--color-border)]">
        <Block title="Ingresos" rows={ingresos} total={totalIn} tone="success" />
        <Block title="Egresos" rows={egresos} total={totalOut} tone="danger" />
      </div>
      {traspasos > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted-foreground)]">
          Traspaso entre cuentas (neutro): {formatMoney(traspasos)}
        </div>
      )}
    </Card>
  );
}

function Block({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: Row[];
  total: number;
  tone: 'success' | 'danger';
}) {
  const color = tone === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]';
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-[var(--color-muted-foreground)]">{title}</span>
        <span className={`text-sm font-semibold ${color}`}>{formatMoney(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">—</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-foreground)]">{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{formatMoney(r.amount)}</span>
                <span className="w-10 text-right text-xs text-[var(--color-muted-foreground)]">
                  {total > 0 ? `${Math.round((r.amount / total) * 100)}%` : '—'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores. (Aún no se usa en ningún lado; se integra en la Task 11.)

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/BankCategoryBreakdown.tsx && git commit -m "feat: componente de desglose por categoría"
```

### Task 11: Integración en BanksTab (desglose + columna/filtro/override)

**Files:**
- Modify: `frontend/src/pages/finance/BanksTab.tsx`

**Nota de diseño:** el spec pide "Badge + Select" en la celda de categoría. Para no poner dos
controles redundantes en una fila densa, la celda usa **un `Select` inline** que muestra y
edita la categoría (display + edición en un solo control); el `Badge` con color se usa en el
desglose. Un marcador sutil indica `categoryManual`.

- [ ] **Step 1: Imports** — agregar:
  - de `@/hooks/useFinance`: `useBankByCategory` (no hace falta aquí si se usa dentro del componente) y `useSetTransactionCategory`.
  - de `@/lib/domain`: `bankCategoryOptions`.
  - el componente: `import { BankCategoryBreakdown } from './BankCategoryBreakdown';`
  - de `@/components/ui/select`: ya está `Select` importado.

- [ ] **Step 2: Estado del filtro de categoría** — junto a los otros `useState`:
```ts
const [category, setCategory] = useState('');
```

- [ ] **Step 3: Pasar el filtro a movimientos** — en `useBankTransactions({...})`, agregar:
```ts
    category: category || undefined,
```

- [ ] **Step 4: Mutación** — junto a los hooks:
```ts
const setCategoryMut = useSetTransactionCategory();
```

- [ ] **Step 5: Render del desglose** — insertar **después** de la sección de evolución mensual y **antes** del bloque `{/* Filtros */}`:
```tsx
<BankCategoryBreakdown
  organizationId={organizationId}
  bankAccountId={bankAccountId || undefined}
  month={month}
/>
```

- [ ] **Step 6: Filtro por categoría** — en el grid de filtros, agregar un `Select` (las opciones incluyen "Sin categoría" con el sentinel `__none__`, distinto del placeholder):
```tsx
<Select
  options={[{ value: '__none__', label: 'Sin categoría' }, ...bankCategoryOptions]}
  placeholder="Todas las categorías"
  value={category}
  onChange={(e) => setCategory(e.target.value)}
/>
```
El contenedor de filtros hoy es `lg:max-w-3xl lg:grid-cols-3`; al pasar a 4 controles,
cambiarlo a `lg:max-w-5xl lg:grid-cols-4` para que quede en una sola fila.

- [ ] **Step 7: Columna "Categoría" en la tabla** — en el `<thead>`, agregar un `<th>` (p. ej. después de "Canal / Doc."):
```tsx
<th className="px-4 py-3 font-medium">Categoría</th>
```
y en cada fila del `<tbody>`, **en la misma posición** (inmediatamente después de la celda
"Canal / Doc.", para que coincida con el `<th>` y el `colSpan` ajustado), una celda con el
`Select` inline (el override usa `value=""` → null, sin placeholder):
```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-1">
    <Select
      className="h-8 min-w-[150px] text-xs"
      options={[{ value: '', label: 'Sin categoría' }, ...bankCategoryOptions]}
      value={t.category ?? ''}
      onChange={(e) =>
        setCategoryMut.mutate({ id: t.id, category: e.target.value || null })
      }
    />
    {t.categoryManual && (
      <span title="Ajustada manualmente" className="text-[var(--color-muted-foreground)]">•</span>
    )}
  </div>
</td>
```
**Importante:** el `<tfoot>` actual usa `colSpan` calculado con `showAccountColumn`. Al sumar
la columna Categoría, **incrementar en 1** ese `colSpan` (de `showAccountColumn ? 4 : 3` a
`showAccountColumn ? 5 : 4`) para que el pie de tabla siga alineado.

- [ ] **Step 8: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores.

- [ ] **Step 9: Verificación manual** (backend `npm run dev` + frontend `npm run dev`, login `ceo@vitam.tech`):
  1. En Bancos aparece la sección "De dónde entra / a dónde va" con Ingresos (Ventas, Fonasa, Transferencias) y Egresos (Honorarios, Proveedores, Combustible…) con % y la línea de traspasos internos aparte.
  2. La tabla de movimientos muestra la columna Categoría con el `Select`; cambiar una categoría persiste, refresca el desglose, y al recargar sigue cambiada con el marcador `•`.
  3. El filtro "Sin categoría" (`__none__`) acota la tabla a los no clasificados; filtrar por una categoría concreta también.
  4. El pie de tabla (totales) sigue alineado con la nueva columna.

- [ ] **Step 10: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/BanksTab.tsx && git commit -m "feat: desglose, columna, filtro y override de categoría en Bancos"
```

---

## Verificación final

- [ ] Backend compila: `cd backend && npm run build`. Backfill corrido (`npm run prisma:categorize`).
- [ ] Frontend compila: `cd frontend && npm run lint` y `npm run build`.
- [ ] Los 4 puntos de verificación manual de la Task 11 pasan.
- [ ] Actualizar la memoria `finanzas-consolidacion-roadmap` marcando el sub-proyecto B como hecho (sigue C: conciliación).
