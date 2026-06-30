# Categorización a escala — categorías y reglas editables — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al CEO categorizar movimientos bancarios a escala sin tocar código: gestionar categorías y reglas como datos en BD, que se apliquen retroactiva y automáticamente, con acciones masivas y un panel de gestión.

**Architecture:** Las categorías (`BankCategory`) y las reglas (`BankCategoryRule`) pasan a ser tablas Prisma. El categorizador puro deja de tener reglas hardcodeadas: expone `normalizeText` + `categorizeWith(rules, …)`, que reciben las reglas cargadas desde BD una vez por operación. Un submódulo nuevo `finance-categories/` ofrece CRUD de categorías y reglas + reaplicar + preview; `finance-imports` gana un endpoint de categorización masiva y usa reglas de BD al importar. El frontend reemplaza los `Record` hardcodeados por hooks (`useBankCategories`, `useCategoryRules`, …), reescribe el desglose para colorear por `kind`, y agrega en Bancos el flujo "crear regla", selección múltiple y un panel de gestión.

**Tech Stack:** Express + Prisma (migración + `$queryRaw` no necesario aquí; todo Prisma ORM), Zod, React + Vite + TanStack Query, Tailwind v4. **Sin framework de tests**: verificación = typecheck (`backend: npm run build`, `frontend: npm run lint`) + seed/reaplicar + prueba manual.

**Spec:** `docs/superpowers/specs/2026-06-30-categorizacion-reglas-editables-design.md`

---

## Estructura de archivos

**Backend** (`backend/`):
- `prisma/schema.prisma` — **Modificar**: modelos `BankCategory`, `BankCategoryRule`; enums `BankCategoryKind`, `RuleDirection`.
- `prisma/migrations/<ts>_bank_categories_rules/` — **Crear** (vía `prisma migrate dev`).
- `prisma/scripts/seed-categories.ts` — **Crear**: siembra las 10 categorías + reglas traducidas (idempotente, `upsert`).
- `package.json` — **Modificar**: script `prisma:seed-categories`.
- `src/modules/finance-imports/finance-imports.categories.ts` — **Modificar**: `normalizeText` + `categorizeWith`; quitar `BANK_CATEGORIES`/`BANK_CATEGORY_TYPE`/`RULES`/`categorize` (en el chunk de limpieza).
- `src/modules/finance-categories/categories.schema.ts` — **Crear**.
- `src/modules/finance-categories/categories.service.ts` — **Crear**: CRUD de categorías.
- `src/modules/finance-categories/categories.controller.ts` — **Crear**.
- `src/modules/finance-categories/categories.routes.ts` — **Crear** (incluye `POST /reapply`).
- `src/modules/finance-categories/category-rules.schema.ts` — **Crear**.
- `src/modules/finance-categories/category-rules.service.ts` — **Crear**: CRUD reglas + `getActiveRules` + `reapplyRules` + `previewRule`.
- `src/modules/finance-categories/category-rules.controller.ts` — **Crear**.
- `src/modules/finance-categories/category-rules.routes.ts` — **Crear** (incluye `GET /preview`).
- `src/routes/index.ts` — **Modificar**: montar `/finance/categories` y `/finance/category-rules`.
- `src/modules/finance-imports/finance-imports.service.ts` — **Modificar**: `createRow(rules)`, `confirmImport` carga reglas una vez, `setCategoryBulk`, validar `category` contra tabla.
- `finance-imports.schema.ts` — **Modificar**: `setCategorySchema` → `z.string().nullable()`; `bulkCategorySchema`.
- `finance-imports.controller.ts` — **Modificar**: `bulkCategoryController`.
- `finance-imports.routes.ts` — **Modificar**: ruta `POST /transactions/bulk-category`.
- `prisma/scripts/categorize-backfill.ts` — **Modificar**: cargar reglas de BD (usa `getActiveRules` + `categorizeWith`).

**Frontend** (`frontend/src/`):
- `types/domain.ts` — **Modificar**: `BankCategory`, `BankCategoryRule`, `BankCategoryKind`, `RuleDirection`.
- `lib/domain.ts` — **Modificar**: badge por `kind`; quitar `bankCategory`/`bankCategoryType`/`bankCategoryOptions`/union `BankCategory` (en el chunk de limpieza).
- `hooks/useFinance.ts` — **Modificar**: `useBankCategories`, `useSaveCategory`, `useDeleteCategory`, `useCategoryRules`, `useSaveRule`, `useDeleteRule`, `useReorderRules`, `useReapplyRules`, `useRulePreview`, `useBulkSetCategory`.
- `pages/finance/BankCategoryBreakdown.tsx` — **Modificar** (reescritura): deriva `kind`/`name` de `useBankCategories()`.
- `pages/finance/CreateRuleFromMovement.tsx` — **Crear**: popover "crear regla" desde un movimiento.
- `pages/finance/CategoryRulesPanel.tsx` — **Crear**: modal de gestión de categorías y reglas.
- `pages/finance/BanksTab.tsx` — **Modificar**: opciones desde hook, columna checkbox + barra bulk, botón "Gestionar", acción crear-regla por fila.

**Nota:** rama `develop`. `git add` con **rutas explícitas** siempre. La rama `main` se sincroniza solo al final, cuando la pieza esté implementada y verificada (preferencia del CEO).

---

## Chunk 1: Backend — modelo de datos, categorizador (aditivo) y seed

### Task 1: Modelos Prisma + migración

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<ts>_bank_categories_rules/migration.sql` (generado)

- [ ] **Step 1: Agregar los enums** — junto a los otros `enum` del schema:
```prisma
enum BankCategoryKind {
  INCOME
  EXPENSE
  NEUTRAL
}

enum RuleDirection {
  CHARGE
  CREDIT
  ANY
}
```

- [ ] **Step 2: Agregar los modelos** — al final de la sección de modelos:
```prisma
model BankCategory {
  id        String           @id @default(cuid())
  key       String           @unique
  name      String
  kind      BankCategoryKind
  active    Boolean          @default(true)
  sortOrder Int              @default(0)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  rules     BankCategoryRule[]

  @@map("bank_categories")
}

model BankCategoryRule {
  id          String        @id @default(cuid())
  categoryKey String
  category    BankCategory  @relation(fields: [categoryKey], references: [key], onDelete: Cascade)
  matchText   String
  direction   RuleDirection @default(ANY)
  priority    Int           @default(0)
  active      Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([active, priority])
  @@index([categoryKey])
  @@map("bank_category_rules")
}
```
(No se toca `BankTransaction`: sigue con `category String?` + `categoryManual`. La relación es por valor, no FK.)

- [ ] **Step 2b: Verificar el formato** — `cd /c/Workspace/Code/vitamcore/backend && npx prisma format`. Expected: sin errores; el archivo queda alineado.

- [ ] **Step 3: Generar y aplicar la migración** (Postgres corriendo vía `docker compose up -d`):
```bash
cd /c/Workspace/Code/vitamcore/backend && npx prisma migrate dev --name bank_categories_rules
```
Expected: crea la carpeta de migración, crea las tablas/enums, regenera el cliente.

- [ ] **Step 4: Typecheck** — `npm run build`. Expected: compila (el cliente Prisma ya conoce `bankCategory`/`bankCategoryRule`).

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/prisma/schema.prisma backend/prisma/migrations && git commit -m "feat: modelos BankCategory y BankCategoryRule"
```

### Task 2: Categorizador aditivo (`normalizeText` + `categorizeWith`)

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.categories.ts`

**Nota:** en este chunk **añadimos** las funciones nuevas sin quitar `BANK_CATEGORIES`/`RULES`/`categorize` (siguen usándose en import/schema/backfill hasta el chunk 2). Así todo compila en cada paso.

- [ ] **Step 1: Agregar al inicio del archivo** (después de los `export const BANK_CATEGORIES`… existentes, sin borrarlos todavía) las funciones nuevas:
```ts
export type RuleDirection = 'CHARGE' | 'CREDIT' | 'ANY';

/// Normaliza para comparar: minúsculas + sin diacríticos + colapsa espacios
/// internos. NO hace trim(): un espacio inicial/final en matchText es un
/// centinela de borde de palabra deliberado (ej. ' iva' para no calzar 'activa').
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

/// Clasifica un movimiento contra reglas ya cargadas (activas, ordenadas por
/// priority asc). matchText se asume YA normalizado. Primera que calza gana.
/// Devuelve la categoryKey o null ("Sin categoría") si nada calza.
export function categorizeWith(
  rules: { categoryKey: string; matchText: string; direction: RuleDirection }[],
  description: string,
  isCharge: boolean,
): string | null {
  const d = normalizeText(description);
  for (const r of rules) {
    if (r.direction === 'CHARGE' && !isCharge) continue;
    if (r.direction === 'CREDIT' && isCharge) continue;
    if (d.includes(r.matchText)) return r.categoryKey;
  }
  return null;
}
```

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports/finance-imports.categories.ts && git commit -m "feat: normalizeText y categorizeWith (categorizador basado en reglas de BD)"
```

### Task 3: Seed de categorías + reglas (siembra lo actual)

**Files:**
- Create: `backend/prisma/scripts/seed-categories.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Crear el script** — inlinea las 10 categorías y traduce las reglas hardcodeadas preservando el orden como `priority` (el seed NO importa de `categories.ts` porque esos artefactos se eliminan en el chunk 2):
```ts
import { prisma } from '../../src/lib/prisma';
import { normalizeText } from '../../src/modules/finance-imports/finance-imports.categories';

// 10 categorías iniciales (key estable, name visible, kind, orden de display).
const CATEGORIES: { key: string; name: string; kind: 'INCOME' | 'EXPENSE' | 'NEUTRAL'; sortOrder: number }[] = [
  { key: 'VENTAS', name: 'Ventas / Recaudación', kind: 'INCOME', sortOrder: 1 },
  { key: 'FONASA', name: 'Fonasa / Prestaciones', kind: 'INCOME', sortOrder: 2 },
  { key: 'TRANSFER_IN', name: 'Transferencias recibidas', kind: 'INCOME', sortOrder: 3 },
  { key: 'HONORARIOS', name: 'Honorarios / Sueldos', kind: 'EXPENSE', sortOrder: 4 },
  { key: 'PROVEEDORES', name: 'Proveedores', kind: 'EXPENSE', sortOrder: 5 },
  { key: 'COMBUSTIBLE', name: 'Combustible', kind: 'EXPENSE', sortOrder: 6 },
  { key: 'IMPUESTOS', name: 'Impuestos', kind: 'EXPENSE', sortOrder: 7 },
  { key: 'CREDITOS', name: 'Créditos / Deuda', kind: 'EXPENSE', sortOrder: 8 },
  { key: 'COMISIONES', name: 'Comisiones bancarias', kind: 'EXPENSE', sortOrder: 9 },
  { key: 'TRASPASO_INTERNO', name: 'Traspaso entre cuentas', kind: 'NEUTRAL', sortOrder: 10 },
];

// Reglas en el MISMO orden de evaluación que el array RULES hardcodeado.
// priority = índice (asc). direction 'ANY' salvo PROVEEDORES ('CHARGE').
// matchText se guarda normalizado; ' iva' conserva su espacio inicial.
const RULES: { categoryKey: string; matchText: string; direction: 'CHARGE' | 'CREDIT' | 'ANY' }[] = [
  { categoryKey: 'TRASPASO_INTERNO', matchText: 'traspaso a cuenta:', direction: 'ANY' },
  { categoryKey: 'TRASPASO_INTERNO', matchText: 'traspaso de cuenta:', direction: 'ANY' },
  { categoryKey: 'FONASA', matchText: 'fonasa', direction: 'ANY' },
  { categoryKey: 'VENTAS', matchText: 'deposito en efectivo', direction: 'ANY' },
  { categoryKey: 'VENTAS', matchText: 'banchile pagos', direction: 'ANY' },
  { categoryKey: 'TRANSFER_IN', matchText: 'traspaso de:', direction: 'ANY' },
  { categoryKey: 'COMBUSTIBLE', matchText: 'copec', direction: 'ANY' },
  { categoryKey: 'CREDITOS', matchText: 'pago de credito', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: 'sii', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: 'tesoreria', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: 'ppm', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: ' iva', direction: 'ANY' }, // espacio inicial deliberado
  { categoryKey: 'IMPUESTOS', matchText: 'impto', direction: 'ANY' },
  { categoryKey: 'COMISIONES', matchText: 'comision', direction: 'ANY' },
  { categoryKey: 'COMISIONES', matchText: 'mantencion', direction: 'ANY' },
  { categoryKey: 'COMISIONES', matchText: 'impuesto cheques', direction: 'ANY' },
  { categoryKey: 'HONORARIOS', matchText: 'traspaso a:', direction: 'ANY' },
  { categoryKey: 'PROVEEDORES', matchText: 'pago:', direction: 'CHARGE' },
];

async function main() {
  for (const c of CATEGORIES) {
    await prisma.bankCategory.upsert({
      where: { key: c.key },
      update: { name: c.name, kind: c.kind, sortOrder: c.sortOrder },
      create: c,
    });
  }

  // Reglas: idempotencia por (categoryKey, matchText, direction). Como no hay
  // unique compuesto, se limpian las reglas seed y se recrean. Las reglas
  // creadas luego por el CEO desde la UI tendrán priority >= 100 (ver service),
  // así que borrar por priority < 100 no las toca.
  await prisma.bankCategoryRule.deleteMany({ where: { priority: { lt: 100 } } });
  let priority = 0;
  for (const r of RULES) {
    await prisma.bankCategoryRule.create({
      data: {
        categoryKey: r.categoryKey,
        matchText: normalizeText(r.matchText), // preserva ' iva' (normalizeText no trimea)
        direction: r.direction,
        priority,
        active: true,
      },
    });
    priority += 1;
  }
  console.log(`Sembradas ${CATEGORIES.length} categorías y ${RULES.length} reglas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

> **Decisión de prioridad seed vs usuario:** las reglas del seed ocupan `priority` 0..17. Las reglas creadas por el CEO desde la UI nacen con `priority = max(priority)+1` (ver `createRule`, Task 5), por lo que quedan **después** de las del seed. El seed re-ejecutable borra solo `priority < 100` para no tocar reglas del usuario; ninguna regla de usuario debe bajar de 100 — para garantizarlo, `createRule` arranca la numeración de usuario en `max(100, maxPriority+1)`.

- [ ] **Step 2: Agregar el script npm** — en `backend/package.json`, dentro de `"scripts"`:
```json
    "prisma:seed-categories": "tsx prisma/scripts/seed-categories.ts",
```

- [ ] **Step 3: Correr el seed**
```bash
cd /c/Workspace/Code/vitamcore/backend && npm run prisma:seed-categories
```
Expected: imprime `Sembradas 10 categorías y 18 reglas.`

- [ ] **Step 4: Verificar paridad ANTES de reaplicar** — guardar la distribución actual por categoría (viene del backfill previo del sub-proyecto B):
```bash
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT COALESCE(category,'(null)') AS categoria, count(*) FROM bank_transactions GROUP BY category ORDER BY 1;"
```
Expected: anotar los conteos (referencia de paridad para el chunk 2, donde `reapplyRules` debe reproducirlos).

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/prisma/scripts/seed-categories.ts backend/package.json && git commit -m "feat: seed de categorías y reglas iniciales (prisma:seed-categories)"
```

---

## Chunk 2: Backend — submódulo finance-categories, import y limpieza

### Task 4: Schemas de categorías y reglas

**Files:**
- Create: `backend/src/modules/finance-categories/categories.schema.ts`
- Create: `backend/src/modules/finance-categories/category-rules.schema.ts`

- [ ] **Step 1: `categories.schema.ts`**:
```ts
import { z } from 'zod';

export const kindSchema = z.enum(['INCOME', 'EXPENSE', 'NEUTRAL']);

export const listCategoriesQuery = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  kind: kindSchema,
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  kind: kindSchema.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
```

- [ ] **Step 2: `category-rules.schema.ts`**:
```ts
import { z } from 'zod';

export const directionSchema = z.enum(['CHARGE', 'CREDIT', 'ANY']);

export const createRuleSchema = z.object({
  categoryKey: z.string().min(1),
  matchText: z.string().min(1, 'El texto de la regla es obligatorio'),
  direction: directionSchema.optional(),
});

export const updateRuleSchema = z.object({
  categoryKey: z.string().min(1).optional(),
  matchText: z.string().min(1).optional(),
  direction: directionSchema.optional(),
  active: z.boolean().optional(),
});

export const reorderRulesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const previewRuleQuery = z.object({
  matchText: z.string().min(1),
  direction: directionSchema.optional(),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
```

- [ ] **Step 3: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 4: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-categories/categories.schema.ts backend/src/modules/finance-categories/category-rules.schema.ts && git commit -m "feat: schemas de categorías y reglas"
```

### Task 5: Services de categorías y reglas (CRUD + reaplicar + preview)

**Files:**
- Create: `backend/src/modules/finance-categories/category-rules.service.ts`
- Create: `backend/src/modules/finance-categories/categories.service.ts`

- [ ] **Step 1: `category-rules.service.ts`** (incluye `getActiveRules`, `reapplyRules`, `previewRule` porque las reglas son el corazón):
```ts
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import {
  categorizeWith,
  normalizeText,
  type RuleDirection,
} from '../finance-imports/finance-imports.categories';
import type { CreateRuleInput, UpdateRuleInput } from './category-rules.schema';

/// Reglas activas ordenadas por priority asc (forma que consume categorizeWith).
export async function getActiveRules() {
  return prisma.bankCategoryRule.findMany({
    where: { active: true },
    orderBy: { priority: 'asc' },
    select: { categoryKey: true, matchText: true, direction: true },
  });
}

export async function listRules() {
  return prisma.bankCategoryRule.findMany({ orderBy: { priority: 'asc' } });
}

async function assertCategoryExists(categoryKey: string) {
  const cat = await prisma.bankCategory.findUnique({
    where: { key: categoryKey },
    select: { key: true },
  });
  if (!cat) throw badRequest('La categoría indicada no existe');
}

/// Recalcula la categoría de los movimientos NO fijados a mano con las reglas
/// vigentes. Idempotente; persiste solo los que cambian. Devuelve cuántos.
export async function reapplyRules() {
  const rules = await getActiveRules();
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { id: true, description: true, chargeAmount: true, category: true },
  });
  let updated = 0;
  for (const t of txs) {
    const next = categorizeWith(rules, t.description, t.chargeAmount > 0);
    if (next !== t.category) {
      await prisma.bankTransaction.update({
        where: { id: t.id },
        data: { category: next },
      });
      updated += 1;
    }
  }
  return { updated };
}

export async function createRule(input: CreateRuleInput) {
  await assertCategoryExists(input.categoryKey);
  const max = await prisma.bankCategoryRule.aggregate({ _max: { priority: true } });
  // Reglas de usuario arrancan en >= 100 para no chocar con el rango del seed.
  const priority = Math.max(100, (max._max.priority ?? -1) + 1);
  const rule = await prisma.bankCategoryRule.create({
    data: {
      categoryKey: input.categoryKey,
      matchText: normalizeText(input.matchText), // no trimea: preserva centinelas de espacio
      direction: (input.direction ?? 'ANY') as RuleDirection,
      priority,
    },
  });
  const { updated } = await reapplyRules();
  return { rule, recategorized: updated };
}

export async function updateRule(id: string, input: UpdateRuleInput) {
  const current = await prisma.bankCategoryRule.findUnique({ where: { id } });
  if (!current) throw notFound('Regla no encontrada');
  if (input.categoryKey) await assertCategoryExists(input.categoryKey);
  const rule = await prisma.bankCategoryRule.update({
    where: { id },
    data: {
      categoryKey: input.categoryKey,
      matchText: input.matchText !== undefined ? normalizeText(input.matchText) : undefined,
      direction: input.direction as RuleDirection | undefined,
      active: input.active,
    },
  });
  const { updated } = await reapplyRules();
  return { rule, recategorized: updated };
}

export async function deleteRule(id: string) {
  const current = await prisma.bankCategoryRule.findUnique({ where: { id } });
  if (!current) throw notFound('Regla no encontrada');
  await prisma.bankCategoryRule.delete({ where: { id } });
  const { updated } = await reapplyRules();
  return { recategorized: updated };
}

export async function reorderRules(ids: string[]) {
  // Reescribe priority según el orden recibido, preservando el offset base de
  // cada regla (seed < 100 mantiene su rango; usuario >= 100 mantiene el suyo).
  // Simplicidad: respeta el rango de la primera regla de la lista como base.
  const rules = await prisma.bankCategoryRule.findMany({
    where: { id: { in: ids } },
    select: { id: true, priority: true },
  });
  const base = Math.min(...rules.map((r) => r.priority));
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.bankCategoryRule.update({ where: { id }, data: { priority: base + i } }),
    ),
  );
  const { updated } = await reapplyRules();
  return { recategorized: updated };
}

/// Cuenta movimientos NO fijados cuya descripción contiene matchText (con la
/// dirección dada). Ignora la prioridad de otras reglas: es una aproximación
/// "cuántos contienen este texto", rotulada ~N en la UI.
export async function previewRule(matchText: string, direction: RuleDirection) {
  const needle = normalizeText(matchText);
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { description: true, chargeAmount: true },
  });
  let count = 0;
  for (const t of txs) {
    const isCharge = t.chargeAmount > 0;
    if (direction === 'CHARGE' && !isCharge) continue;
    if (direction === 'CREDIT' && isCharge) continue;
    if (normalizeText(t.description).includes(needle)) count += 1;
  }
  return { count };
}
```

- [ ] **Step 2: `categories.service.ts`**:
```ts
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema';

export async function listCategories(includeInactive: boolean) {
  return prisma.bankCategory.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/// Slug ASCII en mayúsculas a partir del nombre, con sufijo si colisiona.
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'CATEGORIA';
}

export async function createCategory(input: CreateCategoryInput) {
  const baseKey = slugify(input.name);
  let key = baseKey;
  let n = 1;
  // Asegura unicidad del key.
  while (await prisma.bankCategory.findUnique({ where: { key }, select: { key: true } })) {
    n += 1;
    key = `${baseKey}_${n}`;
  }
  return prisma.bankCategory.create({
    data: {
      key,
      name: input.name,
      kind: input.kind,
      sortOrder: input.sortOrder ?? 999,
    },
  });
}

export async function updateCategory(key: string, input: UpdateCategoryInput) {
  const current = await prisma.bankCategory.findUnique({ where: { key }, select: { key: true } });
  if (!current) throw notFound('Categoría no encontrada');
  return prisma.bankCategory.update({ where: { key }, data: input });
}

export async function deleteCategory(key: string) {
  const [txCount, ruleCount] = await Promise.all([
    prisma.bankTransaction.count({ where: { category: key } }),
    prisma.bankCategoryRule.count({ where: { categoryKey: key } }),
  ]);
  if (txCount > 0 || ruleCount > 0) {
    throw badRequest('Categoría en uso: desactívala en vez de borrarla');
  }
  await prisma.bankCategory.delete({ where: { key } });
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck** — `npm run build`. Expected: compila.

- [ ] **Step 4: Verificar paridad del reaplicar** — corre el reaplicar manual y compara con el snapshot de la Task 3 Step 4. Crea un mini-runner temporal o usa `prisma studio`/psql. Forma rápida: agregar temporalmente nada; en su lugar valida vía endpoint en la Task 6. (Marcar este step como dependiente de Task 6 si se prefiere.)

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-categories/categories.service.ts backend/src/modules/finance-categories/category-rules.service.ts && git commit -m "feat: services de categorías y reglas (CRUD + reaplicar + preview)"
```

### Task 6: Controllers + rutas del submódulo + montaje

**Files:**
- Create: `backend/src/modules/finance-categories/categories.controller.ts`
- Create: `backend/src/modules/finance-categories/categories.routes.ts`
- Create: `backend/src/modules/finance-categories/category-rules.controller.ts`
- Create: `backend/src/modules/finance-categories/category-rules.routes.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: `categories.controller.ts`** (incluye `reapply`, que vive bajo `/finance/categories/reapply`):
```ts
import type { Request, Response } from 'express';
import * as service from './categories.service';
import { reapplyRules } from './category-rules.service';
import {
  createCategorySchema,
  listCategoriesQuery,
  updateCategorySchema,
} from './categories.schema';

export async function listCategoriesController(req: Request, res: Response) {
  const { includeInactive } = listCategoriesQuery.parse(req.query);
  res.json({ data: await service.listCategories(includeInactive) });
}

export async function createCategoryController(req: Request, res: Response) {
  const input = createCategorySchema.parse(req.body);
  res.json({ data: await service.createCategory(input) });
}

export async function updateCategoryController(req: Request, res: Response) {
  const input = updateCategorySchema.parse(req.body);
  res.json({ data: await service.updateCategory(req.params.key, input) });
}

export async function deleteCategoryController(req: Request, res: Response) {
  res.json({ data: await service.deleteCategory(req.params.key) });
}

export async function reapplyController(_req: Request, res: Response) {
  res.json({ data: await reapplyRules() });
}
```

- [ ] **Step 2: `categories.routes.ts`** — `reapply` antes de `/:key` (no colisiona por método, pero se ordena por claridad):
```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createCategoryController,
  deleteCategoryController,
  listCategoriesController,
  reapplyController,
  updateCategoryController,
} from './categories.controller';

export const financeCategoriesRouter = Router();

financeCategoriesRouter.get('/', asyncHandler(listCategoriesController));
financeCategoriesRouter.post('/', asyncHandler(createCategoryController));
financeCategoriesRouter.post('/reapply', asyncHandler(reapplyController));
financeCategoriesRouter.patch('/:key', asyncHandler(updateCategoryController));
financeCategoriesRouter.delete('/:key', asyncHandler(deleteCategoryController));
```

- [ ] **Step 3: `category-rules.controller.ts`**:
```ts
import type { Request, Response } from 'express';
import * as service from './category-rules.service';
import {
  createRuleSchema,
  previewRuleQuery,
  reorderRulesSchema,
  updateRuleSchema,
} from './category-rules.schema';

export async function listRulesController(_req: Request, res: Response) {
  res.json({ data: await service.listRules() });
}

export async function createRuleController(req: Request, res: Response) {
  const input = createRuleSchema.parse(req.body);
  res.json({ data: await service.createRule(input) });
}

export async function updateRuleController(req: Request, res: Response) {
  const input = updateRuleSchema.parse(req.body);
  res.json({ data: await service.updateRule(req.params.id, input) });
}

export async function deleteRuleController(req: Request, res: Response) {
  res.json({ data: await service.deleteRule(req.params.id) });
}

export async function reorderRulesController(req: Request, res: Response) {
  const { ids } = reorderRulesSchema.parse(req.body);
  res.json({ data: await service.reorderRules(ids) });
}

export async function previewRuleController(req: Request, res: Response) {
  const { matchText, direction } = previewRuleQuery.parse(req.query);
  res.json({ data: await service.previewRule(matchText, direction ?? 'ANY') });
}
```

- [ ] **Step 4: `category-rules.routes.ts`** — rutas de segmento fijo (`/preview`, `/reorder`) antes de `/:id`:
```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  createRuleController,
  deleteRuleController,
  listRulesController,
  previewRuleController,
  reorderRulesController,
  updateRuleController,
} from './category-rules.controller';

export const financeCategoryRulesRouter = Router();

financeCategoryRulesRouter.get('/', asyncHandler(listRulesController));
financeCategoryRulesRouter.post('/', asyncHandler(createRuleController));
financeCategoryRulesRouter.get('/preview', asyncHandler(previewRuleController));
financeCategoryRulesRouter.post('/reorder', asyncHandler(reorderRulesController));
financeCategoryRulesRouter.patch('/:id', asyncHandler(updateRuleController));
financeCategoryRulesRouter.delete('/:id', asyncHandler(deleteRuleController));
```

- [ ] **Step 5: Montar en `routes/index.ts`** — agregar los imports junto a los otros routers y, **después** de la línea `apiRouter.use('/finance/imports', requireAuth, financeImportsRouter);`:
```ts
import { financeCategoriesRouter } from '../modules/finance-categories/categories.routes';
import { financeCategoryRulesRouter } from '../modules/finance-categories/category-rules.routes';
// …
apiRouter.use('/finance/categories', requireAuth, financeCategoriesRouter);
apiRouter.use('/finance/category-rules', requireAuth, financeCategoryRulesRouter);
```
(El `apiRouter.use('/finance', financeRouter)` no captura estas rutas: `financeRouter` no las define y delega al siguiente middleware.)

- [ ] **Step 6: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila.

- [ ] **Step 7: Verificación funcional + paridad** — levantar `npm run dev` y, autenticado (cookie del login `ceo@vitam.tech`), ejecutar el reaplicar y comparar con el snapshot de la Task 3 Step 4:
```bash
# Reaplicar (requiere cookie; alternativamente desde la UI en el chunk 4).
# Vía psql tras llamar el endpoint, revisar la distribución:
docker exec -i vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT COALESCE(category,'(null)') AS categoria, count(*) FROM bank_transactions GROUP BY category ORDER BY 1;"
```
Expected: **misma distribución** que el snapshot previo (paridad startsWith→contains confirmada). Si difiere, revisar la regla afectada antes de seguir.

- [ ] **Step 8: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-categories/categories.controller.ts backend/src/modules/finance-categories/categories.routes.ts backend/src/modules/finance-categories/category-rules.controller.ts backend/src/modules/finance-categories/category-rules.routes.ts backend/src/routes/index.ts && git commit -m "feat: endpoints de categorías y reglas + montaje"
```

### Task 7: Import con reglas de BD, bulk, validación y limpieza del categorizador

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.service.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.schema.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.controller.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.routes.ts`
- Modify: `backend/src/modules/finance-imports/finance-imports.categories.ts`
- Modify: `backend/prisma/scripts/categorize-backfill.ts`

- [ ] **Step 1: `confirmImport` carga reglas una vez** — en `finance-imports.service.ts`, importar `getActiveRules` y `categorizeWith`:
```ts
import { categorizeWith } from './finance-imports.categories';
import { getActiveRules } from '../finance-categories/category-rules.service';
```
y en `confirmImport`, **antes** del `prisma.$transaction` (después de calcular `rowsToInsert`):
```ts
  const rules = await getActiveRules();
```
y pasar `rules` a `createRow`:
```ts
      const created = await createRow(tx, batch, row, rules);
```

- [ ] **Step 2: `createRow` acepta `rules`** — cambiar la firma y la rama banco:
```ts
async function createRow(
  tx: Prisma.TransactionClient,
  batch: { id: string; organizationId: string; bankAccountId: string | null; type: FinancialImportType },
  row: StoredPreviewRow,
  rules: { categoryKey: string; matchText: string; direction: 'CHARGE' | 'CREDIT' | 'ANY' }[],
) {
```
y en `tx.bankTransaction.create({ data: { … } })`, reemplazar el `category: categorize(...)` actual por:
```ts
        category: categorizeWith(
          rules,
          stringOrDefault(row.data.description, 'Movimiento importado'),
          numberOrDefault(row.data.chargeAmount) > 0,
        ),
```
(Quitar el `import { categorize }` viejo de este archivo.)

- [ ] **Step 3: `setCategoryBulk` + validación de categoría** — agregar al service:
```ts
async function assertCategoryKey(category: string | null) {
  if (category === null) return;
  const cat = await prisma.bankCategory.findUnique({
    where: { key: category },
    select: { key: true },
  });
  if (!cat) throw badRequest('La categoría indicada no existe');
}

export async function setCategoryBulk(ids: string[], category: string | null) {
  await assertCategoryKey(category);
  const result = await prisma.bankTransaction.updateMany({
    where: { id: { in: ids } },
    data: { category, categoryManual: true },
  });
  return { updated: result.count };
}
```
y en `setTransactionCategory` (existente) agregar la validación al inicio:
```ts
  await assertCategoryKey(category);
```
(Asegurar que `badRequest` esté importado en el archivo; ya se usa en `confirmImport`.)

- [ ] **Step 4: Schemas** — en `finance-imports.schema.ts`: quitar el `import { BANK_CATEGORIES }`, y cambiar `setCategorySchema` + agregar `bulkCategorySchema`:
```ts
export const setCategorySchema = z.object({
  category: z.string().nullable(),
});

export const bulkCategorySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  category: z.string().nullable(),
});

export type BulkCategoryInput = z.infer<typeof bulkCategorySchema>;
```

- [ ] **Step 5: Controller + ruta del bulk** — en `finance-imports.controller.ts` agregar:
```ts
export async function bulkCategoryController(req: Request, res: Response) {
  const input = bulkCategorySchema.parse(req.body);
  res.json({ data: await service.setCategoryBulk(input.ids, input.category) });
}
```
(importar `bulkCategorySchema`). En `finance-imports.routes.ts`, agregar el controller al import y registrar la ruta **junto a las otras `/transactions/...` de segmento fijo**, antes de `GET /transactions`:
```ts
financeImportsRouter.post(
  '/transactions/bulk-category',
  asyncHandler(bulkCategoryController),
);
```

- [ ] **Step 6: Limpiar el categorizador** — en `finance-imports.categories.ts`, **eliminar** `BANK_CATEGORIES`, `BankCategory` (type), `BankCategoryType`, `BANK_CATEGORY_TYPE`, `Rule`, `RULES` y `categorize`. Dejar solo `RuleDirection`, `normalizeText` y `categorizeWith`.

- [ ] **Step 7: Actualizar el backfill** — `prisma/scripts/categorize-backfill.ts` ya no puede importar `categorize`. Reescribir su `main` para cargar reglas de BD:
```ts
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
```

- [ ] **Step 8: Typecheck** — `cd /c/Workspace/Code/vitamcore/backend && npm run build`. Expected: compila (ningún consumidor referencia ya los artefactos eliminados).

- [ ] **Step 9: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add backend/src/modules/finance-imports backend/prisma/scripts/categorize-backfill.ts && git commit -m "feat: import usa reglas de BD, bulk de categoría y limpieza del categorizador"
```

---

## Chunk 3: Frontend — tipos, presentación, hooks y desglose

### Task 8: Tipos

**Files:**
- Modify: `frontend/src/types/domain.ts`

- [ ] **Step 1: Agregar tipos** (junto a `BankTransaction` / `BankCategoryBreakdown` existentes):
```ts
export type BankCategoryKind = 'INCOME' | 'EXPENSE' | 'NEUTRAL';
export type RuleDirection = 'CHARGE' | 'CREDIT' | 'ANY';

export interface BankCategory {
  id: string;
  key: string;
  name: string;
  kind: BankCategoryKind;
  active: boolean;
  sortOrder: number;
}

export interface BankCategoryRule {
  id: string;
  categoryKey: string;
  matchText: string;
  direction: RuleDirection;
  priority: number;
  active: boolean;
}
```
(`BankTransaction.category`/`categoryManual` y `BankCategoryBreakdown` ya existen del sub-proyecto B; no se tocan.)

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores.

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/types/domain.ts && git commit -m "feat: tipos BankCategory y BankCategoryRule"
```

### Task 9: Presentación por kind (aditivo en `lib/domain.ts`)

**Files:**
- Modify: `frontend/src/lib/domain.ts`

**Nota:** añadimos el helper por `kind` sin borrar todavía `bankCategory`/`bankCategoryType`/`bankCategoryOptions` (los consumidores se migran en las Tasks 11-12; la limpieza es la Task 13).

- [ ] **Step 1: Agregar** (junto a los otros helpers; reutiliza el tipo `Tone` ya presente):
```ts
import type { BankCategoryKind } from '@/types/domain';

const bankKindTone: Record<BankCategoryKind, Tone> = {
  INCOME: { label: 'Ingreso', className: 'bg-emerald-50 text-emerald-700' },
  EXPENSE: { label: 'Egreso', className: 'bg-red-50 text-red-700' },
  NEUTRAL: { label: 'Neutro', className: 'bg-slate-100 text-slate-500' },
};

/** Clase de color del badge de categoría según su tipo (kind). */
export function bankKindClassName(kind: BankCategoryKind | undefined): string {
  return (kind ? bankKindTone[kind] : bankKindTone.NEUTRAL).className;
}
```
(Si `Tone` no está exportado, no importa: se usa solo dentro del archivo.)

- [ ] **Step 2: Typecheck** — `npm run lint`. Expected: sin errores.

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/lib/domain.ts && git commit -m "feat: color de badge de categoría por kind"
```

### Task 10: Hooks

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts`

- [ ] **Step 1: Imports de tipos** — agregar `BankCategory`, `BankCategoryRule` al `import type { … } from '@/types/domain'`.

- [ ] **Step 2: Hooks de categorías** — agregar (cerca de `useBankByCategory`):
```ts
export function useBankCategories() {
  return useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: () =>
      api
        .get<{ data: BankCategory[] }>('/finance/categories?includeInactive=true')
        .then((r) => r.data),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { key?: string; name: string; kind: string; active?: boolean; sortOrder?: number }) =>
      payload.key
        ? api.patch(`/finance/categories/${payload.key}`, payload)
        : api.post('/finance/categories', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'categories'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.del(`/finance/categories/${key}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'categories'] });
      qc.invalidateQueries({ queryKey: ['finance-imports'] });
    },
  });
}
```
> **Verificar el método DELETE del cliente `api`:** confirmar en `frontend/src/lib/api.ts` el nombre del helper de DELETE (`api.del` o `api.delete`) y usar el correcto. Si no existe, usar el que el cliente exponga (revisar usos previos en otros hooks).

- [ ] **Step 3: Hooks de reglas** — agregar:
```ts
export function useCategoryRules() {
  return useQuery({
    queryKey: ['finance', 'category-rules'],
    queryFn: () =>
      api.get<{ data: BankCategoryRule[] }>('/finance/category-rules').then((r) => r.data),
  });
}

function invalidateRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['finance', 'category-rules'] });
  qc.invalidateQueries({ queryKey: ['finance-imports'] }); // reaplica recategoriza movimientos
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; categoryKey?: string; matchText?: string; direction?: string; active?: boolean }) =>
      payload.id
        ? api.patch(`/finance/category-rules/${payload.id}`, payload)
        : api.post('/finance/category-rules', payload),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/finance/category-rules/${id}`),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useReorderRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/finance/category-rules/reorder', { ids }),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useReapplyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ data: { updated: number } }>('/finance/categories/reapply', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-imports'] }),
  });
}

export function useRulePreview(matchText: string, direction: string) {
  return useQuery({
    queryKey: ['finance', 'rule-preview', matchText, direction],
    enabled: matchText.trim().length > 0,
    queryFn: () =>
      api
        .get<{ data: { count: number } }>(
          `/finance/category-rules/preview${toQuery({ matchText, direction })}`,
        )
        .then((r) => r.data),
  });
}
```

- [ ] **Step 4: Hook de bulk** — agregar:
```ts
export function useBulkSetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; category: string | null }) =>
      api.post('/finance/imports/transactions/bulk-category', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-imports'] }),
  });
}
```

- [ ] **Step 5: Typecheck** — `npm run lint`. Expected: sin errores. Si `api.post` no acepta genérico o `api.del` no existe, ajustar a la API real de `lib/api.ts`.

- [ ] **Step 6: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/hooks/useFinance.ts && git commit -m "feat: hooks de categorías, reglas, reaplicar, preview y bulk"
```

### Task 11: Reescritura del desglose por categoría

**Files:**
- Modify: `frontend/src/pages/finance/BankCategoryBreakdown.tsx`

- [ ] **Step 1: Reescribir el componente** para derivar `kind`/`name` de `useBankCategories()` en vez de `bankCategoryType`/`bankCategoryLabel`:
```tsx
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/domain';
import { useBankByCategory, useBankCategories } from '@/hooks/useFinance';
import type { BankCategoryKind } from '@/types/domain';

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
  const categories = useBankCategories();

  const { ingresos, egresos, traspasos, totalIn, totalOut } = useMemo(() => {
    const data = query.data ?? [];
    // Mapa key → { name, kind }; incluye inactivas (el hook trae todas).
    const meta = new Map<string, { name: string; kind: BankCategoryKind }>();
    for (const c of categories.data ?? []) meta.set(c.key, { name: c.name, kind: c.kind });

    const ingresos: Row[] = [];
    const egresos: Row[] = [];
    let traspasos = 0;
    for (const r of data) {
      if (r.category === null) {
        if (r.credits > 0) ingresos.push({ key: 'null-in', label: 'Sin categoría', amount: r.credits });
        if (r.charges > 0) egresos.push({ key: 'null-out', label: 'Sin categoría', amount: r.charges });
        continue;
      }
      const info = meta.get(r.category);
      const label = info?.name ?? r.category; // fallback al key crudo
      const kind = info?.kind ?? 'NEUTRAL';
      if (kind === 'NEUTRAL') {
        traspasos += r.credits + r.charges;
      } else if (kind === 'INCOME') {
        ingresos.push({ key: r.category, label, amount: r.credits });
      } else {
        egresos.push({ key: r.category, label, amount: r.charges });
      }
    }
    ingresos.sort((a, b) => b.amount - a.amount);
    egresos.sort((a, b) => b.amount - a.amount);
    const totalIn = ingresos.reduce((s, r) => s + r.amount, 0);
    const totalOut = egresos.reduce((s, r) => s + r.amount, 0);
    return { ingresos, egresos, traspasos, totalIn, totalOut };
  }, [query.data, categories.data]);

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

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores.

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/BankCategoryBreakdown.tsx && git commit -m "feat: desglose por categoría derivado de useBankCategories (color por kind)"
```

---

## Chunk 4: Frontend — crear-regla, bulk, panel de gestión, limpieza y verificación

### Task 12: Popover "crear regla desde un movimiento"

**Files:**
- Create: `frontend/src/pages/finance/CreateRuleFromMovement.tsx`

- [ ] **Step 1: Crear el componente** — botón que abre un popover prellenado con la descripción del movimiento; usa `useRulePreview` (debounced simple por el propio estado) y `useSaveRule`:
```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useRulePreview, useSaveRule } from '@/hooks/useFinance';
import type { BankCategory } from '@/types/domain';

const DIRECTIONS = [
  { value: 'ANY', label: 'Cualquiera' },
  { value: 'CHARGE', label: 'Cargo' },
  { value: 'CREDIT', label: 'Abono' },
];

export function CreateRuleFromMovement({
  description,
  isCharge,
  pinned,
  categories,
}: {
  description: string;
  isCharge: boolean;
  pinned: boolean;
  categories: BankCategory[];
}) {
  const [open, setOpen] = useState(false);
  const [matchText, setMatchText] = useState(description);
  const [direction, setDirection] = useState(isCharge ? 'CHARGE' : 'ANY');
  const [categoryKey, setCategoryKey] = useState('');
  const preview = useRulePreview(matchText, direction);
  const saveRule = useSaveRule();

  const activeCats = categories.filter((c) => c.active);

  async function crear() {
    if (!categoryKey) return;
    await saveRule.mutateAsync({ categoryKey, matchText, direction });
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        title="Crear regla desde este movimiento"
        className="text-xs text-[var(--color-primary)] hover:underline"
        onClick={() => setOpen(true)}
      >
        + regla
      </button>
    );
  }

  return (
    <div className="absolute z-20 mt-1 w-80 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-lg">
      <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">
        Cuando la descripción <strong>contenga</strong>:
      </p>
      <Input value={matchText} onChange={(e) => setMatchText(e.target.value)} className="font-mono text-xs" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Select options={DIRECTIONS} value={direction} onChange={(e) => setDirection(e.target.value)} />
        <Select
          options={activeCats.map((c) => ({ value: c.key, label: c.name }))}
          placeholder="Categoría…"
          value={categoryKey}
          onChange={(e) => setCategoryKey(e.target.value)}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        Calza con ~{preview.data?.count ?? '…'} movimientos
      </p>
      {pinned && (
        <p className="mt-1 text-xs text-[var(--color-warning)]">
          Este movimiento está ajustado a mano; la regla no lo tocará.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button onClick={crear} disabled={!categoryKey || saveRule.isPending}>Crear regla</Button>
      </div>
    </div>
  );
}
```
> **Verificar nombres de props de `ui/button`/`ui/select`** contra usos existentes (variant, options, placeholder) — ya usados así en `ClientDetailPage`/`BanksTab`.

- [ ] **Step 2: Typecheck** — `npm run lint`. Expected: sin errores (aún no se usa; se integra en Task 14).

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/CreateRuleFromMovement.tsx && git commit -m "feat: popover crear regla desde un movimiento"
```

### Task 13: Panel de gestión de categorías y reglas

**Files:**
- Create: `frontend/src/pages/finance/CategoryRulesPanel.tsx`

- [ ] **Step 1: Crear el modal** con dos secciones (categorías y reglas). Reusa `ui/modal`, `ui/input`, `ui/select`, `ui/button`, `ui/feedback`:
```tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { getErrorMessage } from '@/lib/errors';
import {
  useBankCategories,
  useCategoryRules,
  useSaveCategory,
  useDeleteCategory,
  useSaveRule,
  useDeleteRule,
  useReorderRules,
  useReapplyRules,
} from '@/hooks/useFinance';

const KINDS = [
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'EXPENSE', label: 'Egreso' },
  { value: 'NEUTRAL', label: 'Neutro' },
];
const DIRECTIONS = [
  { value: 'ANY', label: 'Cualquiera' },
  { value: 'CHARGE', label: 'Cargo' },
  { value: 'CREDIT', label: 'Abono' },
];

export function CategoryRulesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useBankCategories();
  const rules = useCategoryRules();
  const saveCategory = useSaveCategory();
  const deleteCategory = useDeleteCategory();
  const saveRule = useSaveRule();
  const deleteRule = useDeleteRule();
  const reorderRules = useReorderRules();
  const reapply = useReapplyRules();

  const [newCat, setNewCat] = useState({ name: '', kind: 'EXPENSE' });
  const [newRule, setNewRule] = useState({ matchText: '', direction: 'ANY', categoryKey: '' });
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  const cats = categories.data ?? [];
  const ruleList = rules.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Categorías y reglas">
      {error && <ErrorState message={error} />}

      {/* CATEGORÍAS */}
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold">Categorías</h3>
        {categories.isLoading ? (
          <Spinner label="Cargando…" />
        ) : (
          <ul className="space-y-1">
            {cats.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{c.name}</span>
                <Select
                  className="h-8 w-28 text-xs"
                  options={KINDS}
                  value={c.kind}
                  onChange={(e) => run(() => saveCategory.mutateAsync({ key: c.key, name: c.name, kind: e.target.value }))}
                />
                <Button
                  variant="outline"
                  onClick={() => run(() => saveCategory.mutateAsync({ key: c.key, name: c.name, kind: c.kind, active: !c.active }))}
                >
                  {c.active ? 'Activa' : 'Inactiva'}
                </Button>
                <Button variant="outline" onClick={() => run(() => deleteCategory.mutateAsync(c.key))}>
                  Borrar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Input placeholder="Nueva categoría…" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <Select className="w-28" options={KINDS} value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value })} />
          <Button
            disabled={!newCat.name}
            onClick={() => run(async () => { await saveCategory.mutateAsync(newCat); setNewCat({ name: '', kind: 'EXPENSE' }); })}
          >
            Agregar
          </Button>
        </div>
      </section>

      {/* REGLAS */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Reglas (orden = prioridad)</h3>
          <Button variant="outline" onClick={() => run(async () => { const r = await reapply.mutateAsync(); setError(`Reaplicadas: ${(r as { data: { updated: number } }).data?.updated ?? 0} movimientos actualizados.`); })}>
            Reaplicar reglas ahora
          </Button>
        </div>
        {rules.isLoading ? (
          <Spinner label="Cargando…" />
        ) : (
          <ul className="space-y-1">
            {ruleList.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <div className="flex flex-col">
                  <button disabled={i === 0} title="Subir"
                    onClick={() => run(() => reorderRules.mutateAsync(swap(ruleList.map((x) => x.id), i, i - 1)))}>▲</button>
                  <button disabled={i === ruleList.length - 1} title="Bajar"
                    onClick={() => run(() => reorderRules.mutateAsync(swap(ruleList.map((x) => x.id), i, i + 1)))}>▼</button>
                </div>
                <span className="flex-1 font-mono text-xs">contiene “{r.matchText}”</span>
                <span className="w-20 text-xs text-[var(--color-muted-foreground)]">{r.direction}</span>
                <span className="w-40 text-xs">{cats.find((c) => c.key === r.categoryKey)?.name ?? r.categoryKey}</span>
                <Button variant="outline" onClick={() => run(() => saveRule.mutateAsync({ id: r.id, active: !r.active }))}>
                  {r.active ? 'Activa' : 'Inactiva'}
                </Button>
                <Button variant="outline" onClick={() => run(() => deleteRule.mutateAsync(r.id))}>Borrar</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
          <Input placeholder="texto a contener…" className="font-mono text-xs" value={newRule.matchText} onChange={(e) => setNewRule({ ...newRule, matchText: e.target.value })} />
          <Select className="w-28" options={DIRECTIONS} value={newRule.direction} onChange={(e) => setNewRule({ ...newRule, direction: e.target.value })} />
          <Select className="w-40" options={cats.filter((c) => c.active).map((c) => ({ value: c.key, label: c.name }))} placeholder="Categoría…" value={newRule.categoryKey} onChange={(e) => setNewRule({ ...newRule, categoryKey: e.target.value })} />
          <Button
            disabled={!newRule.matchText || !newRule.categoryKey}
            onClick={() => run(async () => { await saveRule.mutateAsync(newRule); setNewRule({ matchText: '', direction: 'ANY', categoryKey: '' }); })}
          >
            Agregar
          </Button>
        </div>
      </section>
    </Modal>
  );
}

function swap(ids: string[], i: number, j: number): string[] {
  const copy = [...ids];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
```
> **Verificar el contrato de `ui/modal`** (props `open`/`onClose`/`title` o equivalentes) contra `ReconcileModal.tsx`, que ya lo usa; ajustar nombres si difieren. El input de `matchText` usa `font-mono` para que los espacios (centinela ` iva`) sean visibles, y **no** se trimea.

- [ ] **Step 2: Typecheck** — `npm run lint`. Expected: sin errores.

- [ ] **Step 3: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/CategoryRulesPanel.tsx && git commit -m "feat: panel de gestión de categorías y reglas"
```

### Task 14: Integración en BanksTab (opciones desde hook, checkbox + bulk, botón gestionar, crear-regla)

**Files:**
- Modify: `frontend/src/pages/finance/BanksTab.tsx`

- [ ] **Step 1: Imports** — agregar:
```ts
import { useBankCategories, useBulkSetCategory, useSetTransactionCategory } from '@/hooks/useFinance';
import { CategoryRulesPanel } from './CategoryRulesPanel';
import { CreateRuleFromMovement } from './CreateRuleFromMovement';
```
y **quitar** el import de `bankCategoryOptions` desde `@/lib/domain` (se reemplaza por el hook).

- [ ] **Step 2: Estado y datos** — junto a los `useState`/hooks existentes:
```ts
const categoriesQuery = useBankCategories();
const categoryOptions = (categoriesQuery.data ?? [])
  .filter((c) => c.active)
  .map((c) => ({ value: c.key, label: c.name }));
const setCategoryMut = useSetTransactionCategory();
const bulkSet = useBulkSetCategory();
const [selected, setSelected] = useState<Set<string>>(new Set());
const [panelOpen, setPanelOpen] = useState(false);
```

- [ ] **Step 3: Reemplazar `bankCategoryOptions`** — en el `Select` de filtro de categoría y en el `Select` inline de la celda, usar `categoryOptions` en vez de `bankCategoryOptions`. El filtro mantiene el sentinel `__none__`:
```tsx
options={[{ value: '__none__', label: 'Sin categoría' }, ...categoryOptions]}
```
y el override inline mantiene `''` → null:
```tsx
options={[{ value: '', label: 'Sin categoría' }, ...categoryOptions]}
```

- [ ] **Step 4: Botón "Gestionar"** — en la cabecera de la pestaña (junto al título o filtros):
```tsx
<Button variant="outline" onClick={() => setPanelOpen(true)}>Gestionar categorías y reglas</Button>
{/* … al final del return … */}
<CategoryRulesPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
```

- [ ] **Step 5: Columna de selección** — en el `<thead>`, una `<th>` inicial con un checkbox "seleccionar todo (filtrado)":
```tsx
<th className="px-2 py-3">
  <input
    type="checkbox"
    checked={transactions.length > 0 && selected.size === transactions.length}
    onChange={(e) => setSelected(e.target.checked ? new Set(transactions.map((t) => t.id)) : new Set())}
  />
</th>
```
(`transactions` = el array que ya itera el `<tbody>`; usar el nombre real de la variable en el archivo.) En cada fila, una `<td>` con su checkbox:
```tsx
<td className="px-2 py-3">
  <input
    type="checkbox"
    checked={selected.has(t.id)}
    onChange={(e) => {
      const next = new Set(selected);
      e.target.checked ? next.add(t.id) : next.delete(t.id);
      setSelected(next);
    }}
  />
</td>
```
**Importante:** sumar **1** al `colSpan` del `<tfoot>` (ahora hay una columna más). Hoy es `showAccountColumn ? 5 : 4` (tras el sub-proyecto B); pasa a `showAccountColumn ? 6 : 5`.

- [ ] **Step 6: Barra de acción bulk** — encima de la tabla, visible con `selected.size > 0`:
```tsx
{selected.size > 0 && (
  <div className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--color-muted)] px-3 py-2 text-sm">
    <span>{selected.size} seleccionados</span>
    <Select
      className="h-8 w-48"
      options={[{ value: '', label: 'Sin categoría' }, ...categoryOptions]}
      placeholder="Asignar categoría…"
      value=""
      onChange={async (e) => {
        await bulkSet.mutateAsync({ ids: [...selected], category: e.target.value || null });
        setSelected(new Set());
      }}
    />
    <Button variant="outline" onClick={() => setSelected(new Set())}>Limpiar</Button>
  </div>
)}
```

- [ ] **Step 7: Acción crear-regla por fila** — en la celda de categoría, junto al `Select` inline y al marcador `•`, agregar (el contenedor de la celda debe ser `relative` para posicionar el popover):
```tsx
<CreateRuleFromMovement
  description={t.description}
  isCharge={t.chargeAmount > 0}
  pinned={t.categoryManual}
  categories={categoriesQuery.data ?? []}
/>
```

- [ ] **Step 8: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores.

- [ ] **Step 9: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/pages/finance/BanksTab.tsx && git commit -m "feat: opciones desde hook, selección múltiple, bulk, panel y crear-regla en Bancos"
```

### Task 15: Limpieza final de `lib/domain.ts` + verificación manual

**Files:**
- Modify: `frontend/src/lib/domain.ts`

- [ ] **Step 1: Eliminar lo hardcodeado** — borrar `bankCategory` (Record), `bankCategoryType`, `bankCategoryLabel`, `bankCategoryOptions` y el `type BankCategory` union, ya que ningún consumidor los usa (el desglose y BanksTab migraron a hooks). Conservar `bankKindClassName`.

- [ ] **Step 2: Typecheck** — `cd /c/Workspace/Code/vitamcore/frontend && npm run lint`. Expected: sin errores. **Si aparece algún error**, queda un consumidor sin migrar: localizarlo y migrarlo a `useBankCategories()`/`bankKindClassName` antes de borrar.

- [ ] **Step 3: Build completo** — `npm run build` (frontend) y `cd ../backend && npm run build`. Expected: ambos compilan.

- [ ] **Step 4: Verificación manual** (backend `npm run dev` + frontend `npm run dev`, login `ceo@vitam.tech`, pestaña Finanzas → Bancos):
  1. El desglose "De dónde entra / a dónde va" muestra las mismas categorías que antes (paridad), coloreadas por kind.
  2. Abrir "Gestionar categorías y reglas": crear categoría "Arriendo" (Egreso) → aparece en los selects.
  3. Crear regla "contiene `arriendo` → Arriendo": el popover/preview muestra "~N"; al crear, esos movimientos quedan en Arriendo al instante (sin tocar los fijados a mano).
  4. En una fila, usar "+ regla" desde un movimiento (ej. recortar a `copec`) → crea regla y recategoriza.
  5. Seleccionar 3 movimientos con checkbox y asignarles una categoría en bloque → quedan fijados (marcador `•`).
  6. Reordenar dos reglas que compiten cambia el resultado según prioridad; "Reaplicar reglas ahora" no pisa los ajustados a mano.
  7. Desactivar una categoría la saca de los selects pero los movimientos que la tienen siguen mostrando su nombre; borrar una categoría en uso es rechazado con mensaje claro.
  8. El pie de tabla (totales) sigue alineado con la columna de checkbox añadida.

- [ ] **Step 5: Commit**
```bash
cd /c/Workspace/Code/vitamcore && git add frontend/src/lib/domain.ts && git commit -m "refactor: quitar presentación de categorías hardcodeada (migrada a hooks)"
```

---

## Verificación final

- [ ] Backend compila: `cd backend && npm run build`. Migración aplicada, seed corrido (`npm run prisma:seed-categories`), reaplicar con paridad confirmada.
- [ ] Frontend compila: `cd frontend && npm run lint` y `npm run build`.
- [ ] Los 8 puntos de verificación manual de la Task 15 pasan.
- [ ] Sincronizar `main` con `develop` (fast-forward) y push de ambas — recién ahora, según la preferencia del CEO.
- [ ] Actualizar la memoria `finanzas-consolidacion-roadmap`: pieza ① (categorización a escala) hecha; sigue ② (conciliación + cuadre).
```
