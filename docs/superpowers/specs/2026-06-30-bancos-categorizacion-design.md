# Bancos — Categorización de movimientos

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feat/bancos-categorizacion`
**Roadmap:** Sub-proyecto **B** de la consolidación de Finanzas (A evolución mensual ✅ → **B
categorización** → C conciliación → D posición consolidada). Ver memoria
`finanzas-consolidacion-roadmap`.

## Objetivo

Clasificar cada movimiento bancario en una categoría (sueldos, proveedores, impuestos,
ventas…) para responder **"¿de dónde entra y a dónde va la plata?"**. Modo **híbrido**: reglas
automáticas sobre la descripción (que en estas cartolas es muy patroneada) + corrección manual
puntual. Incluye un **desglose por categoría** y la categoría visible/filtrable en la tabla de
movimientos. Trata aparte los **traspasos entre cuentas propias** (no son ingreso ni gasto
real).

## Contexto: lo que ya existe

- `BankTransaction` (`schema.prisma`): `description`, `channel`, `chargeAmount`, `creditAmount`,
  `balance`, etc. La rama banco de `createRow` (`finance-imports.service.ts`) crea cada
  movimiento al confirmar una importación.
- `listBankTransactions` arma la tabla (filtros org/cuenta/mes/búsqueda + `totals`).
- Patrón del módulo `finance-imports`: `routes → controller (Zod .parse) → service (Prisma)`,
  respuestas `{ data }`. Hooks React Query en `useFinance.ts` (key `['finance-imports', ...]`),
  con invalidación de la key raíz en mutaciones.
- Presentación de enums en `frontend/src/lib/domain.ts` con `Record<Enum, Tone>` (label +
  className Tailwind) renderizados con `components/ui/badge.tsx`. `components/ui/select.tsx`
  existe para el override inline.
- **Datos reales** (681 movimientos, 2 cuentas Healthcare): descripciones tipo
  `Traspaso A: [persona]`, `Pago: Copec App`, `Deposito En Efectivo`, `Pago: Prestadores
  Fonasa`, y `Traspaso A/De Cuenta: 00421…` (traspasos internos, ~$144M cada sentido).

## Decisiones de diseño

- **Híbrido**: reglas automáticas + override manual. El override **nunca** es pisado por las
  reglas (flag `categoryManual`).
- **Lista fija curada en código** (no hay CRUD de categorías; las afinamos editando código).
- **Reglas conscientes de la dirección** (cargo vs abono): un `Pago:` que es cargo es gasto,
  pero `Pago: Prestadores Fonasa` que es abono es ingreso.
- **`null` = "Sin categoría / Otros"** (fallback). No se almacena una clave `OTROS`; los no
  clasificados quedan en `category = null` y el desglose los muestra como "Sin categoría",
  separados por dirección (ingreso/egreso) según el monto.
- **Categorizador = única fuente de verdad** (`categorize(description, isCharge)`), usado en el
  import y en el backfill (DRY; nada de reglas duplicadas en SQL).
- **Sin gráficos** (tabla + %), sin pantalla de administración de reglas, independiente de la
  conciliación (sub-proyecto C). YAGNI.

## Taxonomía (claves y tipos)

| Clave | Label | Tipo | Detección (sobre `description` normalizada a minúsculas) |
|---|---|---|---|
| `TRASPASO_INTERNO` | Traspaso entre cuentas | NEUTRAL | empieza con `traspaso a cuenta:` o `traspaso de cuenta:` |
| `FONASA` | Fonasa / Prestaciones | INCOME | contiene `fonasa` |
| `VENTAS` | Ventas / Recaudación | INCOME | empieza con `deposito en efectivo`, o contiene `banchile pagos` |
| `TRANSFER_IN` | Transferencias recibidas | INCOME | empieza con `traspaso de:` |
| `COMBUSTIBLE` | Combustible | EXPENSE | contiene `copec` |
| `CREDITOS` | Créditos / Deuda | EXPENSE | contiene `pago de credito` |
| `IMPUESTOS` | Impuestos | EXPENSE | contiene `sii`, `tesoreria`, `ppm`, ` iva`, `impto` |
| `COMISIONES` | Comisiones bancarias | EXPENSE | contiene `comision`, `mantencion`, `impuesto cheques` |
| `HONORARIOS` | Honorarios / Sueldos | EXPENSE | empieza con `traspaso a:` |
| `PROVEEDORES` | Proveedores | EXPENSE | empieza con `pago:` **y** es cargo |
| _(null)_ | Sin categoría / Otros | — | nada calzó |

**Orden de evaluación = el de la tabla, de arriba hacia abajo; la primera regla que calza
gana.** El orden importa: `TRASPASO_INTERNO` antes que `TRANSFER_IN` (ambos empiezan con
"traspaso"), `FONASA` antes que `PROVEEDORES` (un `Pago:` Fonasa es abono → ingreso, no
proveedor).

## Backend

### 1. Esquema + migración (`schema.prisma`)

En `model BankTransaction` agregar:
```prisma
category       String?
categoryManual Boolean  @default(false)
```
y `@@index([category])`. Migración: `prisma migrate dev --name bank_transaction_category`
(solo agrega las dos columnas; el backfill va en un script aparte). Regenerar cliente.

### 2. Categorizador (`finance-imports.categories.ts`, archivo nuevo)

Única fuente de verdad de categorías + reglas + función de clasificación.

```ts
export type BankCategory =
  | 'TRASPASO_INTERNO' | 'FONASA' | 'VENTAS' | 'TRANSFER_IN'
  | 'COMBUSTIBLE' | 'CREDITOS' | 'IMPUESTOS' | 'COMISIONES'
  | 'HONORARIOS' | 'PROVEEDORES';

export type BankCategoryType = 'INCOME' | 'EXPENSE' | 'NEUTRAL';

export const BANK_CATEGORY_TYPE: Record<BankCategory, BankCategoryType> = {
  TRASPASO_INTERNO: 'NEUTRAL',
  FONASA: 'INCOME', VENTAS: 'INCOME', TRANSFER_IN: 'INCOME',
  COMBUSTIBLE: 'EXPENSE', CREDITOS: 'EXPENSE', IMPUESTOS: 'EXPENSE',
  COMISIONES: 'EXPENSE', HONORARIOS: 'EXPENSE', PROVEEDORES: 'EXPENSE',
};

export const BANK_CATEGORIES = Object.keys(BANK_CATEGORY_TYPE) as BankCategory[];

// Reglas ordenadas; la primera que calza gana. `when` opcional restringe por dirección.
type Rule = { category: BankCategory; when?: 'charge' | 'credit'; test: (d: string) => boolean };

const RULES: Rule[] = [
  { category: 'TRASPASO_INTERNO', test: (d) => d.startsWith('traspaso a cuenta:') || d.startsWith('traspaso de cuenta:') },
  { category: 'FONASA', test: (d) => d.includes('fonasa') },
  { category: 'VENTAS', test: (d) => d.startsWith('deposito en efectivo') || d.includes('banchile pagos') },
  { category: 'TRANSFER_IN', test: (d) => d.startsWith('traspaso de:') },
  { category: 'COMBUSTIBLE', test: (d) => d.includes('copec') },
  { category: 'CREDITOS', test: (d) => d.includes('pago de credito') },
  { category: 'IMPUESTOS', test: (d) => d.includes('sii') || d.includes('tesoreria') || d.includes('ppm') || d.includes(' iva') || d.includes('impto') },
  { category: 'COMISIONES', test: (d) => d.includes('comision') || d.includes('mantencion') || d.includes('impuesto cheques') },
  { category: 'HONORARIOS', test: (d) => d.startsWith('traspaso a:') },
  { category: 'PROVEEDORES', when: 'charge', test: (d) => d.startsWith('pago:') },
];

export function categorize(description: string, isCharge: boolean): BankCategory | null {
  const d = description.trim().toLowerCase();
  for (const r of RULES) {
    if (r.when === 'charge' && !isCharge) continue;
    if (r.when === 'credit' && isCharge) continue;
    if (r.test(d)) return r.category;
  }
  return null;
}
```

### 3. Categorizar al importar (`finance-imports.service.ts`)

En la rama banco de `createRow`, al construir el `data` de `tx.bankTransaction.create`, agregar:
```ts
category: categorize(
  stringOrDefault(row.data.description, 'Movimiento importado'),
  numberOrDefault(row.data.chargeAmount) > 0,
),
```
(`categoryManual` queda en su default `false`.) Importar `categorize` desde `./finance-imports.categories`.

### 4. Backfill de los 681 (`prisma/scripts/categorize-backfill.ts`, nuevo)

Script `tsx` idempotente y re-ejecutable que reclasifica los movimientos **no** corregidos a
mano (única fuente de verdad: reusa `categorize`):
```ts
import { prisma } from '../../src/lib/prisma';
import { categorize } from '../../src/modules/finance-imports/finance-imports.categories';

async function main() {
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { id: true, description: true, chargeAmount: true },
  });
  let updated = 0;
  for (const t of txs) {
    const category = categorize(t.description, t.chargeAmount > 0);
    await prisma.bankTransaction.update({ where: { id: t.id }, data: { category } });
    updated += 1;
  }
  console.log(`Categorizados ${updated} movimientos.`);
}
main().finally(() => prisma.$disconnect());
```
Agregar a `package.json`: `"prisma:categorize": "tsx prisma/scripts/categorize-backfill.ts"`.
Se corre una vez tras la migración; y de nuevo cada vez que afinemos reglas.

### 5. Desglose por categoría (endpoint)

- `finance-imports.schema.ts`: `listByCategoryQuery = listTransactionsQuery.pick({ organizationId: true, bankAccountId: true, month: true })`.
- `finance-imports.service.ts`: `listBankByCategory(filters)` → un `$queryRaw` que agrupa por
  `category` (mismo patrón de condiciones org/cuenta/mes que `listBankMonthly`):
  ```sql
  SELECT category,
         SUM("creditAmount")::bigint AS credits,
         SUM("chargeAmount")::bigint AS charges,
         count(*)::bigint AS count
  FROM "bank_transactions"
  WHERE <org/cuenta/mes>
  GROUP BY category
  ```
  Devuelve `{ category: string | null; credits: number; charges: number; count: number }[]`
  (convertir bigint con `Number()`). El tipo/orden de cada categoría lo resuelve el frontend con
  `BANK_CATEGORY_TYPE`.
- `controller`: `listByCategoryController` (parse + `{ data }`).
- `routes`: `GET /transactions/by-category`, junto a `/transactions/monthly`, **antes** de
  `/transactions`.

### 6. Override manual (endpoint)

- `finance-imports.schema.ts`: `setCategorySchema = z.object({ category: z.enum([...BANK_CATEGORIES]).nullable() })`.
- `finance-imports.service.ts`: `setTransactionCategory(id, category)` → `findUnique` (404 si no
  existe) y `update` con `{ category, categoryManual: true }`. Devuelve el movimiento.
- `controller`: `setCategoryController` (`req.params.id` + body parseado).
- `routes`: `PATCH /transactions/:id/category`.

## Frontend

### 7. Presentación de categorías (`lib/domain.ts`)
- `bankCategory: Record<BankCategory, Tone>` (label + className, estilo los otros enums) para
  las 10 claves. Helper `bankCategoryLabel(c: string | null)` → label o `'Sin categoría'`.
- `bankCategoryType: Record<BankCategory, 'INCOME' | 'EXPENSE' | 'NEUTRAL'>` (espejo del backend,
  para ubicar cada fila en el desglose).
- `bankCategoryOptions` (value+label) para el `Select` del override; incluir una opción
  "Sin categoría" con value vacío (→ `null`).

### 8. Tipos (`types/domain.ts`)
- En `BankTransaction`: `category: string | null;` y `categoryManual: boolean;`.
- `BankCategoryBreakdown { category: string | null; credits: number; charges: number; count: number }`.
- (Opcional) `type BankCategory = ...` espejo, o reutilizar strings.

### 9. Hooks (`hooks/useFinance.ts`)
- `useBankByCategory(filters: { organizationId?; bankAccountId?; month? })` →
  `GET /finance/imports/transactions/by-category`, key `['finance-imports', 'by-category', filters]`.
- `useSetTransactionCategory()` → `PATCH /finance/imports/transactions/:id/category`; en
  `onSuccess` invalida `['finance-imports']` (refresca tabla, desglose y evolución).

### 10. UI (`pages/finance/BanksTab.tsx`)
- **Filtro por categoría**: un `Select` extra en la fila de filtros (opciones = categorías +
  "Sin categoría"); su valor se pasa a `useBankTransactions` (ver nota de alcance abajo).
- **Columna "Categoría"** en la tabla de movimientos: un `Badge` con el `Tone`, y un `Select`
  inline para corregir (dispara `useSetTransactionCategory`). Indicar visualmente (sutil) cuando
  `categoryManual` es true (ej. punto o título "ajustada manualmente").
- **Sección "De dónde entra / a dónde va"** (nueva, estilo la de evolución, entre evolución y
  filtros): consume `useBankByCategory` con los filtros activos. Dos bloques —**Ingresos** y
  **Egresos**— listando categorías de ese tipo con monto y **% del total del bloque**; los
  movimientos `null` se reparten por dirección ("Sin categoría" en ingresos si tienen abono, en
  egresos si tienen cargo). **Traspasos internos** se muestran en una línea aparte, fuera de los
  totales de ingreso/egreso.

## Nota de alcance: filtro por categoría en la tabla

Agregar `category?` a `listTransactionsQuery` y a `ListTransactionsFilters`, y al `where` de
`listBankTransactions` (`category: filters.category` cuando venga; un valor especial `'__none__'`
→ `category: null` para "Sin categoría"). Es el único cambio al endpoint de movimientos
existente.

## Archivos afectados

**Backend**: `schema.prisma`, `prisma/migrations/<ts>_bank_transaction_category/`, nuevo
`finance-imports.categories.ts`, `finance-imports.service.ts`, `finance-imports.controller.ts`,
`finance-imports.routes.ts`, `finance-imports.schema.ts`, nuevo
`prisma/scripts/categorize-backfill.ts`, `package.json` (script npm).

**Frontend**: `lib/domain.ts`, `types/domain.ts`, `hooks/useFinance.ts`,
`pages/finance/BanksTab.tsx`.

## Manejo de errores y casos borde

- **Descripción que ninguna regla atrapa** → `category = null` ("Sin categoría"); se corrige a
  mano. Esperable (ej. `Pago: Proveedores` que llega como abono de $87M).
- **Override**: `setTransactionCategory` marca `categoryManual = true`; el backfill nunca lo
  vuelve a tocar. Poner `category = null` a mano también marca manual (no se reclasifica).
- **Traspasos internos**: excluidos de los totales de ingreso/egreso del desglose; en el flujo
  consolidado mensual (sub-proyecto A) ya se netean entre cuentas, pero acá quedan etiquetados y
  visibles aparte.
- **Movimiento inexistente** en el PATCH → 404 ("Movimiento no encontrado").
- **bigint** de los `SUM(...)::bigint`/`count(*)` → `Number()` (igual que en `listBankMonthly`).
- **Reglas direccionales**: `PROVEEDORES` solo aplica a cargos; un `Pago:` que es abono cae a
  `null` para revisión.

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.
- Backend: `cd backend && npm run build`; migración aplicada, cliente regenerado, backfill
  corrido (`npm run prisma:categorize`).
- Frontend: `cd frontend && npm run build`.
- Manual:
  1. Tras el backfill, la mayoría de los 681 quedan categorizados; `Traspaso A/De Cuenta:` como
     "Traspaso entre cuentas".
  2. El desglose muestra Ingresos (Ventas, Fonasa, Transferencias) y Egresos (Honorarios,
     Proveedores, Combustible…) con % y los traspasos internos aparte.
  3. La tabla muestra la categoría como badge; cambiarla en una fila persiste y refresca el
     desglose; al recargar sigue cambiada y marcada como manual.
  4. Filtrar por una categoría (incl. "Sin categoría") acota la tabla.
  5. Re-correr `npm run prisma:categorize` no pisa la categoría ajustada a mano.
