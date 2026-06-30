# Categorización a escala — categorías y reglas editables

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama sugerida:** `feat/categorizacion-reglas-editables`
**Roadmap:** Pieza **①** de la fase operativa de Finanzas (① categorización a escala → ②
conciliación + cuadre → ③ reportes ejecutivos). Evoluciona el sub-proyecto **B** ya entregado
(`2026-06-30-bancos-categorizacion-design.md`). Ver memoria `finanzas-consolidacion-roadmap`.

## Contexto y problema

La consolidación de Finanzas (A+B+C+D) está construida y funcional. El CEO cargó **5 meses de
datos reales** (libros de venta/compra ene–may + cartolas) y entra en la fase operativa. La
categorización de movimientos bancarios existe pero es **uno-por-uno y rígida**:

- La categoría se corrige con un `Select` inline fila por fila (`BanksTab.tsx`), una request por
  cambio. No hay acción masiva ni "aplicar a todos los que digan X".
- Las **categorías son un enum fijo en código** (10 valores en `finance-imports.categories.ts`).
- Las **reglas de detección están hardcodeadas** en ese mismo archivo (array `RULES`). Afinar una
  regla exige **editar código + redeploy + correr el script** `prisma:categorize` en el servidor.
- Una corrección manual solo afecta ese registro: "PAGO: PROVEEDOR X" se vuelve a corregir mes a
  mes, en cada fila.
- Con ~cientos de movilizaciones (681+ al momento del sub-proyecto B, creciendo cada mes), el
  trabajo manual es el cuello de botella.

**Objetivo:** que el CEO pueda **categorizar a escala sin tocar código** — gestionar sus
categorías, definir reglas que se apliquen retroactiva y automáticamente, y limpiar el "long
tail" con acciones masivas — dejando los datos listos para el cuadre (pieza ②) y los reportes
(pieza ③).

### Objetivos medibles

1. Crear/renombrar/desactivar categorías desde la UI, sin redeploy.
2. Crear una regla (texto + dirección → categoría) que recategorice **al instante** los
   movimientos cargados que calzan (salvo los fijados a mano) y se aplique a futuras
   importaciones.
3. Seleccionar varios movimientos y asignarles categoría en bloque.
4. Reaplicar todas las reglas desde un botón (reemplaza el script de desarrollador).
5. El día 1, la categorización existente se mantiene **idéntica** (seed migra lo actual).

## Decisiones de diseño

- **Enfoque A — categorías y reglas como datos en BD** (no enum/array en código). El categorizador
  pasa a leer reglas desde la BD. Única fuente de verdad.
- **Reglas tipo "contiene texto + dirección"**: `matchText` (substring de la descripción
  normalizada) + `direction` (`CHARGE` | `CREDIT` | `ANY`). Sin regex (YAGNI). Resuelve el caso de
  `Pago: …` que llega como abono.
- **Primera regla que calza gana**, ordenadas por `priority` ascendente. El usuario reordena en el
  panel.
- **Retroactividad automática**: crear/editar/borrar/reordenar una regla, y reaplicar, recalculan
  la categoría de los movimientos **no fijados a mano**. Los fijados (`categoryManual = true`)
  **nunca** se pisan.
- **`category` sigue siendo un `String?` con el `key` de la categoría** en `BankTransaction`. No se
  migra a FK por id → cero migración de datos de movimientos; `BankCategory.key` es la referencia
  por valor. Coherente con todo el código que ya trata `category` como string (filtros,
  `by-category`, badges).
- **Borrado de categoría = desactivar** (`active = false`) si está en uso; borrado duro solo si no
  la usa ningún movimiento ni regla.
- **Normalización consistente** (minúsculas + sin tildes) entre `description` y `matchText`,
  centralizada en un helper reusado por el categorizador y por el conteo de "cuántos calzan".
- El `Select` inline por fila **se mantiene** como escape para casos únicos (fija solo esa fila).

## Modelo de datos

### `BankCategory` (catálogo editable)

```prisma
model BankCategory {
  id        String  @id @default(cuid())
  key       String  @unique          // código estable, ej. "COMBUSTIBLE" (no cambia al renombrar)
  name      String                   // etiqueta visible, ej. "Combustible"
  kind      BankCategoryKind         // INCOME | EXPENSE | NEUTRAL
  active    Boolean @default(true)
  sortOrder Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  rules     BankCategoryRule[]
  @@map("bank_categories")
}

enum BankCategoryKind {
  INCOME
  EXPENSE
  NEUTRAL
}
```

### `BankCategoryRule` (reglas editables)

```prisma
model BankCategoryRule {
  id          String        @id @default(cuid())
  categoryKey String                          // → BankCategory.key (relación por valor)
  category    BankCategory  @relation(fields: [categoryKey], references: [key], onDelete: Cascade)
  matchText   String                          // substring normalizado (minúsculas, sin tildes)
  direction   RuleDirection @default(ANY)     // CHARGE | CREDIT | ANY
  priority    Int           @default(0)       // asc; primera que calza gana
  active      Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([active, priority])
  @@index([categoryKey])
  @@map("bank_category_rules")
}

enum RuleDirection {
  CHARGE
  CREDIT
  ANY
}
```

### `BankTransaction`

Sin cambios de estructura. Sigue con `category String?` (guarda el `key`) y
`categoryManual Boolean`. La relación con `BankCategory` es por valor (no FK), por simplicidad y
para no migrar datos.

> **Nota sobre `onDelete` de las reglas:** `BankCategoryRule.category` usa `onDelete: Cascade`
> contra `BankCategory.key`. Como solo permitimos borrado duro de una categoría **sin uso** (sin
> movimientos ni reglas), el cascade nunca elimina reglas vivas en la práctica; está por
> integridad referencial.

## Lógica del categorizador

`finance-imports.categories.ts` deja de exponer el enum y el array `RULES` hardcodeados. Pasa a:

- `normalizeText(s: string): string` — `toLowerCase()` + quitar diacríticos
  (`normalize('NFD').replace(/\p{Diacritic}/gu, '')`) + colapsar espacios internos múltiples a uno
  (`replace(/\s+/g, ' ')`). **NO hace `trim()`** (ver nota crítica abajo). **Helper único** reusado
  por el categorizador, el import y el conteo de coincidencias.

  > **Crítico — el espacio como centinela de borde de palabra:** la regla `IMPUESTOS` usa
  > `matchText = ' iva'` (espacio inicial **deliberado**) para no calzar con "privada", "activa",
  > "motiva". Si `normalizeText` hiciera `trim()`, `' iva'` → `'iva'` y volverían los falsos
  > positivos. Por eso `normalizeText` **no trimea**: un espacio inicial/final en `matchText` es un
  > centinela de borde de palabra significativo. La descripción tampoco se trimea, así
  > `includes(' iva')` calza "pago iva" (hay espacio antes) y no "privada". En la UI, el campo de
  > texto de la regla **no** auto-trimea el `matchText` (decisión explícita, dado lo crítico del
  > centinela); muestra los espacios al usuario (placeholder o monospace) para que un espacio
  > inicial/final sea visible e intencional. El seed inserta `' iva'` con su espacio.
- `categorizeWith(rules, description, isCharge): string | null` — función **pura** que recibe las
  reglas ya cargadas:
  ```ts
  export function categorizeWith(
    rules: { categoryKey: string; matchText: string; direction: 'CHARGE' | 'CREDIT' | 'ANY' }[],
    description: string,
    isCharge: boolean,
  ): string | null {
    const d = normalizeText(description);
    for (const r of rules) {            // se asume ya ordenadas por priority asc, solo activas
      if (r.direction === 'CHARGE' && !isCharge) continue;
      if (r.direction === 'CREDIT' && isCharge) continue;
      if (d.includes(r.matchText)) return r.categoryKey;
    }
    return null;
  }
  ```
- En `finance-imports.service.ts`, un helper `loadActiveRules()` que trae las reglas activas
  ordenadas por `priority asc`. **Se carga una sola vez por operación** (por importación, por
  reaplicación), no por fila, para no penalizar rendimiento.

`matchText` se **almacena ya normalizado** (al crear/editar la regla se pasa por `normalizeText`),
así la comparación en caliente es solo `includes`.

### Integración con `createRow` (import)

`createRow(tx, batch, row)` se invoca por fila dentro del `prisma.$transaction` de `confirmImport`
y hoy llama a `categorize()` directamente. El cambio: **añadir un parámetro `rules` a la firma**
`createRow(tx, batch, row, rules)`, cargar las reglas activas **una sola vez al inicio de
`confirmImport`** (antes del `$transaction`) y pasarlas a cada `createRow`. La rama banco usa
`categorizeWith(rules, descripción, chargeAmount > 0)` en vez de `categorize(...)`. Así no se
consultan reglas por fila.

## Backend — endpoints

Sigue el patrón del proyecto: `routes → controller (Zod .parse) → service (Prisma)`, respuestas
`{ data }` / `{ ok: true }`. Errores vía `utils/http-error.ts`. Se montan bajo `/finance`.

### Categorías

- `GET /finance/categories` → `listCategories({ includeInactive? })`. Ordena por `sortOrder, name`.
- `POST /finance/categories` → `createCategory({ name, kind, sortOrder? })`. Genera `key` desde el
  `name` (slug en mayúsculas, ASCII; colisión → sufijo numérico). `P2002` → `badRequest`.
- `PATCH /finance/categories/:key` → `updateCategory(key, { name?, kind?, active?, sortOrder? })`.
  404 si no existe. El `key` no se edita.
- `DELETE /finance/categories/:key` → `deleteCategory(key)`. Si hay movimientos con esa categoría o
  reglas que la referencian → `badRequest('Categoría en uso: desactívala en vez de borrarla')`.

### Reglas

- `GET /finance/category-rules` → `listRules()` (todas, ordenadas por `priority asc`).
- `POST /finance/category-rules` → `createRule({ categoryKey, matchText, direction?, priority? })`.
  Valida que `categoryKey` exista (`badRequest` si no). Normaliza `matchText`. Tras crear,
  **reaplica reglas** y devuelve `{ data: rule, recategorized: <n> }`.
- `PATCH /finance/category-rules/:id` → `updateRule(id, {...})`. 404 si no existe. Reaplica.
- `DELETE /finance/category-rules/:id` → `deleteRule(id)`. Reaplica.
- `POST /finance/category-rules/reorder` → `reorderRules({ ids: string[] })`. Reescribe `priority`
  según el orden recibido. Reaplica.

### Reaplicar y conteo

- `POST /finance/categories/reapply` → `reapplyRules()`: trae movimientos `categoryManual = false`,
  carga reglas activas una vez, recalcula con `categorizeWith`, persiste solo los que cambian
  (en lote / transacción). Devuelve `{ data: { updated: <n> } }`. **Reemplaza** el script
  `prisma:categorize` para el uso operativo (el script se mantiene como utilidad de dev).
- `GET /finance/category-rules/preview?matchText=…&direction=…` → `previewRule(...)`: cuenta
  cuántos movimientos **no fijados** (`categoryManual = false`) calzarían con **esa sola regla**
  (su `matchText` + `direction`), para el "calza con N movimientos" del popover. No escribe nada.
  - **Cómo se calcula:** trae a JS las descripciones de los movimientos no fijados y aplica
    `normalizeText` + `includes(matchText)` + chequeo de dirección — **la misma normalización que
    `reapply`**, evitando depender de `unaccent` en SQL (las `description` se guardan crudas en BD;
    Postgres no normaliza tildes sin la extensión). Son cientos de filas: aceptable.
  - **Semántica (importante para no confundir al usuario):** N es "cuántos movimientos contienen
    este texto", **ignorando la prioridad** de otras reglas. Tras reaplicar, el resultado real puede
    ser menor si una regla de mayor prioridad reclama algunos. El popover lo rotula como
    aproximación ("calza con ~N") para no prometer exactitud.

### Bulk manual (selección múltiple)

- `POST /finance/imports/transactions/bulk-category` → `setCategoryBulk({ ids: string[], category })`.
  Asigna `category` (un `key` válido o `null`) a los movimientos indicados y marca
  `categoryManual = true` en todos (es una decisión explícita del usuario sobre filas concretas).
  Valida que `category`, si no es `null`, exista. Devuelve `{ data: { updated: <n> } }`.
  **Orden de rutas:** registrar `POST /transactions/bulk-category` y el resto de subrutas de dos
  segmentos (`/transactions/monthly`, `/transactions/by-category`) **antes** de las rutas con
  `:id` (`PATCH /transactions/:id/category`), siguiendo el cuidado del spec previo, para que
  `bulk-category` no se interprete como un `:id`.

### Cambios a endpoints existentes

- `setTransactionCategory` (PATCH `/transactions/:id/category`): sin cambios de comportamiento
  (sigue fijando `categoryManual = true`); solo se valida el `category` contra la tabla
  `BankCategory` en vez del enum. En `finance-imports.schema.ts`, `setCategorySchema` pasa de
  `z.enum([...BANK_CATEGORIES]).nullable()` a `z.string().nullable()` (la existencia del `key` se
  valida en el service contra la tabla); se quita el `import { BANK_CATEGORIES }`. El mismo
  `z.string().nullable()` aplica al `category` del bulk.
- `createRow` (rama banco del import): en vez de `categorize(desc, isCharge)` con reglas
  hardcodeadas, usa `categorizeWith(rulesCargadas, desc, isCharge)` con las reglas traídas una vez
  al inicio de la importación.
- `listBankByCategory` y el filtro `category` de `listBankTransactions`: sin cambios (siguen
  operando sobre el string `category`). El tipo/orden de cada categoría lo resuelve ahora la tabla
  `BankCategory` (el frontend ya no depende del `Record` hardcodeado en `lib/domain.ts`).

## Frontend

### Tipos (`types/domain.ts`)

```ts
export type BankCategoryKind = 'INCOME' | 'EXPENSE' | 'NEUTRAL';
export type RuleDirection = 'CHARGE' | 'CREDIT' | 'ANY';

export interface BankCategory {
  key: string; name: string; kind: BankCategoryKind; active: boolean; sortOrder: number;
}
export interface BankCategoryRule {
  id: string; categoryKey: string; matchText: string;
  direction: RuleDirection; priority: number; active: boolean;
}
```

### Hooks (`hooks/useFinance.ts`)

- `useBankCategories()` → `GET /finance/categories?includeInactive=true`, key
  `['finance', 'categories']`. **Trae todas (activas e inactivas)** porque los badges y el desglose
  necesitan el `name`/`kind` de categorías inactivas que aún tienen movimientos asignados. Los
  `Select` de elección (override inline, bulk, destino de regla, alta de movimiento) **filtran a
  `active` en el componente**; los badges y el breakdown usan el set completo. Reemplaza
  `bankCategoryOptions` hardcodeado de `lib/domain.ts`.
  - **Mapeo de un `category` (key) sin categoría en el set** (caso degenerado, ej. dato viejo):
    fallback a mostrar el `key` crudo como label y `kind = NEUTRAL`, para no romper el render.
  - **Filtro "Sin categoría"**: se preserva el centinela `'__none__'` del spec previo en el `Select`
    de filtro (con placeholder "Todas las categorías" → `''`), mientras el `Select` de override
    sigue usando `''` → `null`. No unificar (misma razón documentada en el spec previo).
- `useSaveCategory()` / `useDeleteCategory()` → POST/PATCH/DELETE; invalidan
  `['finance', 'categories']` y `['finance-imports']` (los badges/desglose dependen de los nombres).
- `useCategoryRules()` → `GET /finance/category-rules`, key `['finance', 'category-rules']`.
- `useSaveRule()` / `useDeleteRule()` / `useReorderRules()` → invalidan `['finance', 'category-rules']`
  **y** `['finance-imports']` (porque recategorizan movimientos).
- `useReapplyRules()` → `POST /finance/categories/reapply`; invalida `['finance-imports']`.
- `useRulePreview(matchText, direction)` → `GET …/preview` con `enabled` cuando `matchText` no
  vacío (debounced en el componente).
- `useBulkSetCategory()` → `POST /finance/imports/transactions/bulk-category`; invalida
  `['finance-imports']`.

> **Nota de migración de presentación:** hoy `lib/domain.ts` tiene `bankCategory: Record<…, Tone>`,
> `bankCategoryType` y `bankCategoryOptions` hardcodeados. Pasan a derivarse de `useBankCategories()`
> en runtime. Para los colores del badge, en vez de un `Tone` por categoría (imposible de
> mantener fijo si el catálogo es editable), se usa un color por **`kind`** (INCOME = verde,
> EXPENSE = rojo/ámbar, NEUTRAL = gris). Se elimina la dependencia del `Record` fijo.

### UI — desglose por categoría (`pages/finance/BankCategoryBreakdown.tsx`, reescritura)

Este componente **ya existe** y renderiza la sección "De dónde entra / a dónde va". Hoy depende
directamente de `bankCategoryType[r.category]` y `bankCategoryLabel` (los dos artefactos que este
spec elimina). **Hay que reescribirlo** para derivar `kind` y `name` de `useBankCategories()` en
vez de los `Record` hardcodeados:
- Construir un mapa `key → { name, kind }` desde el hook (incluyendo inactivas, ver nota del hook).
- Ubicar cada fila del desglose (`{ category, credits, charges, count }`) en Ingresos/Egresos según
  el `kind` de su categoría; `null` ("Sin categoría") se reparte por dirección como antes;
  `NEUTRAL` (traspasos internos) en su línea aparte.
- Es la **verificación #1** del spec ("el desglose cuadra con el de antes"), así que su reescritura
  no es opcional: sin ella rompe el typecheck.

### UI — pestaña Bancos (`pages/finance/BanksTab.tsx`)

1. **Columna "Categoría"** (ya existe): `Select` inline poblado desde `useBankCategories()`. Se
   mantiene el indicador de "ajustada manualmente".
2. **Crear regla desde un movimiento**: una acción junto al `Select` de la fila (ícono/botón
   pequeño) abre un **popover** prellenado con la descripción del movimiento:
   > Cuando la descripción contenga **[texto editable]** y sea **[cargo ▾ / abono ▾ / cualquiera]**
   > → **[categoría ▾]**
   > *Calza con ~N movimientos* (vía `useRulePreview`, debounced; `~` porque ignora prioridad) ·
   > **[Crear regla]**

   Al confirmar: `useSaveRule()` crea la regla (que reaplica en backend) → la tabla y el desglose
   se refrescan solos. Si el movimiento origen estaba fijado a mano, el popover avisa que la regla
   no lo tocará (puede soltar el pin desde el mismo `Select`).
3. **Selección múltiple (bulk manual)**: casilla por fila + casilla "seleccionar todo (filtrado)".
   Con ≥1 seleccionado aparece una barra de acción: **[Asignar categoría ▾]** → `useBulkSetCategory()`.
   Para el "long tail" que no generaliza en regla.
4. **Botón "Gestionar categorías y reglas"** en la cabecera de la pestaña → abre el panel (modal).

### UI — panel "Categorías y reglas" (`pages/finance/CategoryRulesPanel.tsx`, nuevo)

Modal con dos secciones (reusa `components/ui/modal.tsx`, `input`, `select`, `button`):

- **Categorías**: tabla editable (nombre, tipo, activa, orden). Crear (nombre + tipo), renombrar,
  cambiar tipo, activar/desactivar, borrar (deshabilitado/avisa si está en uso).
- **Reglas**: lista ordenada por prioridad. Cada fila: texto, dirección, categoría destino, activa.
  Crear/editar/borrar. **Reordenar** (subir/bajar o drag) → `useReorderRules()`. Botón **"Reaplicar
  reglas ahora"** (`useReapplyRules()`) con confirmación que muestra cuántos se actualizaron.

## Migración y seed

1. **Migración Prisma** (`prisma migrate dev --name bank_categories_rules`): crea
   `bank_categories`, `bank_category_rules`, los enums `BankCategoryKind` y `RuleDirection`.
   Regenerar cliente.
2. **Seed idempotente** en `prisma/scripts/seed-categories.ts` (script dedicado, re-ejecutable con
   `upsert`; expuesto como `npm run prisma:seed-categories`):
   - Inserta las **10 categorías** actuales (`key`, `name` humano, `kind` desde el `BANK_CATEGORY_TYPE`
     actual, `sortOrder` según el orden de evaluación de hoy).
   - Traduce las **reglas hardcodeadas** de `RULES` al modelo nuevo, preservando el **orden** como
     `priority`:

     | matchText (normalizado) | direction | categoryKey | nota |
     |---|---|---|---|
     | `traspaso a cuenta:` | ANY | TRASPASO_INTERNO | era `startsWith`; "contiene" es equivalente para estas descripciones |
     | `traspaso de cuenta:` | ANY | TRASPASO_INTERNO | (regla aparte; el array soporta varias por categoría) |
     | `fonasa` | ANY | FONASA | |
     | `deposito en efectivo` | ANY | VENTAS | |
     | `banchile pagos` | ANY | VENTAS | |
     | `traspaso de:` | ANY | TRANSFER_IN | después de TRASPASO_INTERNO |
     | `copec` | ANY | COMBUSTIBLE | |
     | `pago de credito` | ANY | CREDITOS | |
     | `sii` / `tesoreria` / `ppm` / ` iva` / `impto` | ANY | IMPUESTOS | una regla por término; `' iva'` con espacio inicial deliberado (centinela de borde de palabra, ver normalizeText) |
     | `comision` / `mantencion` / `impuesto cheques` | ANY | COMISIONES | una regla por término |
     | `traspaso a:` | ANY | HONORARIOS | después de TRASPASO_INTERNO |
     | `pago:` | CHARGE | PROVEEDORES | direccional; un `pago:` abono cae a null |

     **Riesgo conocido (startsWith → contains):** las reglas hoy `startsWith` (`traspaso a:`,
     `pago:`, `deposito en efectivo`) pasan a "contiene". Para estas descripciones de cartola el
     prefijo es el inicio real de la descripción, así que el resultado es equivalente; el orden por
     prioridad (TRASPASO_INTERNO antes que TRANSFER_IN/HONORARIOS) preserva la desambiguación. El
     plan debe **verificar el conteo por categoría antes/después del seed** sobre los 5 meses para
     confirmar paridad.
3. **Reaplicar** (`POST /finance/categories/reapply` o el script) una vez tras el seed: idempotente,
   respeta los `categoryManual`. Confirmar que el desglose por categoría queda igual que antes.

## Archivos afectados

**Backend**: `schema.prisma` (+2 modelos, +2 enums, migración), `finance-imports.categories.ts`
(refactor: helpers `normalizeText`/`categorizeWith`, sin `RULES`/enum hardcodeados), nuevo
submódulo `modules/finance-categories/` con `categories.{routes,controller,service,schema}.ts` y
`category-rules.{routes,controller,service,schema}.ts`, `finance-imports.service.ts` (import usa
reglas de BD; +`setCategoryBulk`),
`finance-imports.{routes,controller,schema}.ts` (bulk endpoint; validación de `category` contra
tabla), `routes/index.ts` (montar nuevas rutas), `prisma/scripts/seed-categories.ts` (nuevo) +
`package.json` (script `prisma:seed-categories`). El script `categorize-backfill.ts` se mantiene
como utilidad de dev (ahora lee reglas de BD).

**Frontend**: `types/domain.ts`, `hooks/useFinance.ts`, `lib/domain.ts` (badge por `kind`, quitar
`Record` fijo `bankCategory`/`bankCategoryType`/`bankCategoryOptions`), `pages/finance/BanksTab.tsx`
(crear-regla, bulk, botón gestionar), `pages/finance/BankCategoryBreakdown.tsx` (**reescritura**:
deriva `kind`/`name` de `useBankCategories()`), nuevo `pages/finance/CategoryRulesPanel.tsx`.

> **Importante para el seed y el script `categorize-backfill.ts`:** como el refactor borra
> `BANK_CATEGORIES` / `BANK_CATEGORY_TYPE` / `RULES` de `finance-imports.categories.ts`, ni el seed
> ni el backfill pueden importarlos. El seed lleva los 10 `kind` y las reglas traducidas
> **inline** (es su rol: poblar la BD). El backfill, tras el refactor, carga reglas **desde la BD**
> (como `reapply`).

## Manejo de errores y casos borde

- **`categoryKey` por valor**: como la relación `BankCategoryRule.categoryKey → BankCategory.key`
  es por valor, un `categoryKey` inexistente daría `P2003` de Prisma; el service lo intercepta
  antes con validación explícita (`badRequest`). Lo mismo aplica al `category` del bulk y del
  override.
- **Crear regla con `categoryKey` inexistente** → `badRequest`.
- **Borrar categoría en uso** (movimientos o reglas) → `badRequest` (sugerir desactivar).
- **Renombrar categoría**: cambia `name`, no `key`; los movimientos y reglas siguen válidos (apuntan
  al `key`). Los badges muestran el nombre nuevo al invalidar la query.
- **Desactivar categoría**: sale de los selects; los movimientos que la tienen conservan el valor y
  se siguen mostrando (con su nombre). Las reglas que la usan: se pueden desactivar manualmente; una
  categoría inactiva no debería seguir asignándose, así que el seed/UI advierte (no se fuerza).
- **Regla que deja de calzar** (editas su texto): al reaplicar, los movimientos que dependían de ella
  y ya no calzan se recalculan con las demás reglas (o `null`). Los fijados a mano no se tocan.
- **Crear regla desde un movimiento fijado**: la regla no pisa ese movimiento; el popover lo avisa.
- **Reaplicar sobre cientos de movimientos**: aceptable; persistir en lote y solo los que cambian.
- **Normalización**: `matchText` se guarda normalizado; la comparación es `includes` sobre la
  descripción normalizada con el mismo helper. "FONASA"/"Fonasa"/"fonasá" calzan igual.

## Fuera de alcance (YAGNI / piezas siguientes)

- Conciliación, cuadre banco-vs-conciliado y reporte de movimientos sin conciliar → **pieza ②**.
- Reportes ejecutivos de gasto por categoría en el tiempo / flujo → **pieza ③**.
- Reglas con regex o por monto/rango.
- Aplicar reglas a libros de venta/compra (esto es solo movimientos bancarios).
- Multiusuario / permisos (app de un solo usuario).

## Verificación

Sin framework de tests; verificación = typecheck + prueba manual.

- Backend: `cd backend && npm run build`; migración aplicada, cliente regenerado, seed corrido.
- Frontend: `cd frontend && npm run lint`.
- Manual:
  1. Tras seed + reaplicar, el desglose por categoría **cuadra con el de antes** (paridad de
     conteos por categoría sobre los 5 meses).
  2. Crear categoría nueva (ej. "Arriendo", tipo EXPENSE) → aparece en los selects.
  3. Crear regla "contiene `arriendo` → Arriendo": el popover muestra "calza con ~N", al confirmar
     esos movimientos quedan categorizados al instante (sin tocar los fijados a mano).
  4. Editar el texto de una regla → recategoriza; reordenar dos reglas que compiten cambia el
     resultado según prioridad.
  5. Seleccionar 3 movimientos sueltos y asignarles categoría en bloque → quedan fijados.
  6. "Reaplicar reglas ahora" no pisa ninguna categoría ajustada a mano.
  7. Desactivar una categoría la saca de los selects pero los movimientos que la tienen siguen
     mostrándola; borrar una categoría en uso es rechazado con mensaje claro.
