# Finanzas: mes, cliente y arreglo de pagadas — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reparar y blindar el estado "pagado" de las facturas, agregar filtro por mes a Ingresos y Cuentas por cobrar, y mostrar el cliente (enlazado a su detalle) en la tabla de Ingresos.

**Architecture:** Cambios backend (Express + Prisma + Zod, módulo `income`) y frontend (React + TanStack Query). El filtro de mes opera sobre `incomeDate` en el listado `GET /income`; un nuevo endpoint `GET /income/months` alimenta un desplegable de meses con datos. El arreglo de "pagadas" es una migración solo-datos más un guard en el service.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Zod, React, Vite, TanStack Query, React Router, Tailwind v4.

**Nota sobre verificación:** El proyecto **no tiene framework de tests**; la verificación es el typecheck: backend `cd backend && npm run build` (tsc), frontend `cd frontend && npm run build` (tsc --noEmit && vite build), más prueba manual. Los pasos sustituyen "test runner" por typecheck.

**Spec:** `docs/superpowers/specs/2026-06-26-finanzas-mes-cliente-pagadas-design.md`

---

## File Structure

**Backend**
- `prisma/migrations/20260626120000_fix_paid_without_paiddate/migration.sql` — nuevo, solo datos.
- `src/modules/income/income.schema.ts` — param `month` en `listIncomeQuery`.
- `src/modules/income/income.service.ts` — rango por mes en `list`; nuevo `listMonths`; guard PAID en `create`/`update`.
- `src/modules/income/income.controller.ts` — nuevo `listMonthsController`.
- `src/modules/income/income.routes.ts` — ruta `GET /months` antes de `/:id`.

**Frontend**
- `src/hooks/useFinance.ts` — `month` en `FinanceFilters`; hook `useIncomeMonths`.
- `src/components/MonthFilter.tsx` — nuevo (Select de meses con datos).
- `src/pages/finance/IncomeTab.tsx` — filtro de mes + columna Cliente.
- `src/pages/finance/ReceivablesTab.tsx` — filtro de mes.

---

## Chunk 1: Backend

### Task 1: Migración de reparación de "pagadas"

**Files:**
- Create: `backend/prisma/migrations/20260626120000_fix_paid_without_paiddate/migration.sql`

- [ ] **Step 1: Crear la migración**

Crea el archivo `backend/prisma/migrations/20260626120000_fix_paid_without_paiddate/migration.sql` con:

```sql
-- Corrige facturas marcadas como pagadas sin fecha de cobro (dato legacy de
-- importaciones previas al rediseño de cobranza). El cobro se registra a mano.
UPDATE "income_records"
SET "status" = 'INVOICED'
WHERE "status" = 'PAID' AND "paidDate" IS NULL;
```

- [ ] **Step 2: Aplicar la migración**

Run: `cd backend && npx prisma migrate deploy`
Expected: aplica `20260626120000_fix_paid_without_paiddate` sin errores ("1 migration applied" o similar). Es no interactivo.

- [ ] **Step 3: Verificar el dato**

Run:
```bash
docker exec vitamcore-postgres psql -U postgres -d vitamcore -c "SELECT count(*) FROM income_records WHERE status='PAID' AND \"paidDate\" IS NULL;"
```
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/migrations/20260626120000_fix_paid_without_paiddate/migration.sql
git commit -m "fix: repara facturas con estado PAID sin fecha de cobro"
```

---

### Task 2: Guard PAID en create/update

**Files:**
- Modify: `backend/src/modules/income/income.service.ts` (`create` ~línea 79; `update` ~línea 84)

- [ ] **Step 1: Agregar helper de invariante**

En `income.service.ts`, justo después del bloque `RECEIVABLE_OR` (antes de `export async function list`), agrega:

```ts
// Invariante de cobranza: el estado PAID solo es válido si hay fecha de cobro.
// El paso a pagado se hace a mano vía registerPayment; el formulario no fija
// paidDate, así que un status PAID sin paidDate se degrada a INVOICED.
function normalizePaidStatus<T extends { status?: string | null }>(
  input: T,
  paidDate: Date | null,
): T {
  if (input.status === 'PAID' && !paidDate) {
    return { ...input, status: 'INVOICED' };
  }
  return input;
}
```

- [ ] **Step 2: Aplicar el guard en `create`**

Reemplaza la función `create`:

```ts
export async function create(input: CreateIncomeInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  return prisma.incomeRecord.create({ data: input });
}
```

por:

```ts
export async function create(input: CreateIncomeInput) {
  await assertContext(input.organizationId, input.businessUnitId, input.projectId);
  // create nunca recibe paidDate (no está en el schema): un PAID se degrada a INVOICED.
  return prisma.incomeRecord.create({ data: normalizePaidStatus(input, null) });
}
```

- [ ] **Step 3: Aplicar el guard en `update`**

Reemplaza la función `update`:

```ts
export async function update(id: string, input: UpdateIncomeInput) {
  const current = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!current) throw notFound('Ingreso no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  return prisma.incomeRecord.update({ where: { id }, data: input });
}
```

por:

```ts
export async function update(id: string, input: UpdateIncomeInput) {
  const current = await prisma.incomeRecord.findUnique({
    where: { id },
    select: { organizationId: true, paidDate: true },
  });
  if (!current) throw notFound('Ingreso no encontrado');
  await assertContext(current.organizationId, input.businessUnitId, input.projectId);
  // Si el form intenta marcar PAID y el registro no tiene cobro, se degrada a INVOICED.
  return prisma.incomeRecord.update({
    where: { id },
    data: normalizePaidStatus(input, current.paidDate),
  });
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/income/income.service.ts
git commit -m "feat: blinda estado PAID para que exija fecha de cobro"
```

---

### Task 3: Filtro `month` en el listado + `listMonths`

**Files:**
- Modify: `backend/src/modules/income/income.schema.ts` (`listIncomeQuery` ~línea 43)
- Modify: `backend/src/modules/income/income.service.ts` (`list` ~línea 33; nuevo `listMonths`)

- [ ] **Step 1: Agregar `month` al schema de query**

En `income.schema.ts`, dentro de `listIncomeQuery` (junto a `paymentState`), agrega:

```ts
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)')
    .optional(),
```

- [ ] **Step 2: Aplicar el rango de mes en `list`**

En `income.service.ts`, dentro de `list`, después del bloque que arma `paymentState`
(justo antes del `return prisma.incomeRecord.findMany({`), agrega:

```ts
  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    where.incomeDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)), // primer día del mes siguiente
    };
  }
```

- [ ] **Step 3: Agregar `listMonths`**

En `income.service.ts`, al final del archivo, agrega:

```ts
/// Meses (YYYY-MM) que tienen ingresos, ordenados descendente. Alimenta el
/// desplegable de filtro por mes (solo ofrece meses con datos).
export async function listMonths(organizationId?: string): Promise<string[]> {
  const orgClause = organizationId
    ? Prisma.sql`AND "organizationId" = ${organizationId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('month', "incomeDate"), 'YYYY-MM') AS mes
    FROM "income_records"
    WHERE "incomeDate" IS NOT NULL ${orgClause}
    ORDER BY mes DESC
  `);
  return rows.map((r) => r.mes);
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/income/income.schema.ts backend/src/modules/income/income.service.ts
git commit -m "feat: filtro por mes y endpoint de meses en ingresos"
```

---

### Task 4: Endpoint `GET /income/months`

**Files:**
- Modify: `backend/src/modules/income/income.controller.ts`
- Modify: `backend/src/modules/income/income.routes.ts`

- [ ] **Step 1: Agregar el controller**

En `income.controller.ts`, agrega el import de `zod` arriba (si no está) y el controller.
Al inicio del archivo, junto a los imports:

```ts
import { z } from 'zod';
```

Y agrega esta función (por ejemplo después de `listController`):

```ts
export async function listMonthsController(req: Request, res: Response) {
  const { organizationId } = z
    .object({ organizationId: z.string().optional() })
    .parse(req.query);
  res.json({ data: await service.listMonths(organizationId) });
}
```

- [ ] **Step 2: Registrar la ruta antes de `/:id`**

En `income.routes.ts`, agrega `listMonthsController` al import desde `./income.controller`
y registra la ruta **antes** de `incomeRouter.get('/:id', ...)`:

```ts
incomeRouter.get('/', asyncHandler(listController));
incomeRouter.get('/months', asyncHandler(listMonthsController));
incomeRouter.post('/', asyncHandler(createController));
incomeRouter.get('/:id', asyncHandler(getController));
```

(El resto de rutas queda igual.)

- [ ] **Step 3: Verificar typecheck**

Run: `cd backend && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Verificar el endpoint (con backend corriendo)**

Si el backend está corriendo (`npm run dev`), opcionalmente:
```bash
curl -s http://localhost:4000/api/income/months --cookie "<sesión>" || true
```
Expected: `{"data":["2026-02","2026-01"]}` (o los meses presentes). Requiere auth; si no
hay sesión a mano, basta con el typecheck — se valida en la prueba manual final.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/income/income.controller.ts backend/src/modules/income/income.routes.ts
git commit -m "feat: ruta GET /income/months"
```

---

## Chunk 2: Frontend

### Task 5: Filtro `month` y hook `useIncomeMonths`

**Files:**
- Modify: `frontend/src/hooks/useFinance.ts` (`FinanceFilters` ~línea 17)

- [ ] **Step 1: Agregar `month` a `FinanceFilters`**

En `useFinance.ts`, dentro del tipo `FinanceFilters`, agrega (junto a `paymentState`):

```ts
  month?: string;
```

(No hay que tocar `useIncome`: ya serializa todo el objeto con `toQuery`, que omite vacíos.)

- [ ] **Step 2: Agregar el hook `useIncomeMonths`**

En `useFinance.ts`, después de `useIncome`, agrega:

```ts
export function useIncomeMonths(organizationId?: string) {
  return useQuery({
    queryKey: ['income', 'months', organizationId ?? 'all'],
    queryFn: () =>
      api
        .get<{ data: string[] }>(`/income/months${toQuery({ organizationId })}`)
        .then((r) => r.data),
  });
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useFinance.ts
git commit -m "feat: filtro month y hook useIncomeMonths"
```

---

### Task 6: Componente `MonthFilter`

**Files:**
- Create: `frontend/src/components/MonthFilter.tsx`

- [ ] **Step 1: Crear el componente**

Crea `frontend/src/components/MonthFilter.tsx` con exactamente este contenido:

```tsx
import { Select } from '@/components/ui/select';
import { useIncomeMonths } from '@/hooks/useFinance';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// 'YYYY-MM' → 'Enero 2026'
function labelMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1] ?? ym} ${y}`;
}

export function MonthFilter({
  organizationId,
  value,
  onChange,
}: {
  organizationId?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const { data: months = [] } = useIncomeMonths(organizationId);
  return (
    <Select
      placeholder="Todos los meses"
      options={months.map((m) => ({ value: m, label: labelMes(m) }))}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MonthFilter.tsx
git commit -m "feat: componente MonthFilter con meses con datos"
```

---

### Task 7: IncomeTab — filtro de mes + columna Cliente

**Files:**
- Modify: `frontend/src/pages/finance/IncomeTab.tsx`

- [ ] **Step 1: Agregar imports**

En `IncomeTab.tsx`, agrega los imports de `Link` y `MonthFilter` arriba:

```tsx
import { Link } from 'react-router-dom';
import { MonthFilter } from '@/components/MonthFilter';
```

- [ ] **Step 2: Incluir `month` en el estado de filtros**

Reemplaza:

```tsx
  const [extra, setExtra] = useState<{ category?: string; status?: string }>({});
```

por:

```tsx
  const [extra, setExtra] = useState<{
    category?: string;
    status?: string;
    month?: string;
  }>({});
```

(`filters` ya hace `{ organizationId, ...extra }`, así que `month` se incluye solo.)

- [ ] **Step 3: Agregar el `MonthFilter` a la barra de filtros**

Dentro del `<div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-md">`, después del
`<Select>` de estados, agrega:

```tsx
          <MonthFilter
            organizationId={organizationId}
            value={extra.month}
            onChange={(month) => setExtra((x) => ({ ...x, month }))}
          />
```

Y cambia ese `<div>` contenedor de `lg:max-w-md` a `lg:max-w-2xl` para que quepan los
tres filtros:

```tsx
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-3">
```

- [ ] **Step 4: Agregar la columna Cliente (encabezado)**

En el `<thead>`, agrega un `<th>` "Cliente" entre "Descripción" y "Empresa":

```tsx
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
```

- [ ] **Step 5: Agregar la celda Cliente (cuerpo)**

En el `<tbody>`, dentro de cada `<tr>`, entre la celda de Descripción y la de Empresa
(la que muestra `r.organization?.name`), agrega:

```tsx
                    <td className="px-4 py-3">
                      {r.clientName ? (
                        r.clientId ? (
                          <Link
                            to={`/clientes/${r.clientId}`}
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {r.clientName}
                          </Link>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">
                            {r.clientName}
                          </span>
                        )
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">—</span>
                      )}
                    </td>
```

- [ ] **Step 6: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/finance/IncomeTab.tsx
git commit -m "feat: filtro por mes y columna cliente en la tabla de ingresos"
```

---

### Task 8: ReceivablesTab — filtro de mes

**Files:**
- Modify: `frontend/src/pages/finance/ReceivablesTab.tsx`

- [ ] **Step 1: Agregar imports y estado de mes**

En `ReceivablesTab.tsx`, agrega el import:

```tsx
import { MonthFilter } from '@/components/MonthFilter';
```

Después de `const [estado, setEstado] = useState<Estado>('receivable');`, agrega:

```tsx
  const [month, setMonth] = useState<string | undefined>();
```

- [ ] **Step 2: Pasar `month` al `useIncome`**

Reemplaza:

```tsx
  const { data: rows = [], isLoading, isError, error } = useIncome({
    organizationId,
    paymentState: estado,
  });
```

por:

```tsx
  const { data: rows = [], isLoading, isError, error } = useIncome({
    organizationId,
    paymentState: estado,
    month,
  });
```

- [ ] **Step 3: Agregar el `MonthFilter` junto a los botones de estado**

Envuelve el grupo de botones de estado y el filtro de mes en un contenedor flex. Reemplaza
la apertura del bloque de filtros de estado:

```tsx
      {/* Filtros de estado */}
      <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
```

por:

```tsx
      {/* Filtros de estado + mes */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-1">
```

Y cierra el nuevo contenedor: localiza el `</div>` que cierra el grupo de botones de
estado (justo después del `.map` de `ESTADOS`) y, inmediatamente después de ese `</div>`,
agrega el filtro de mes y el cierre del contenedor flex:

```tsx
        </div>
        <div className="w-48">
          <MonthFilter
            organizationId={organizationId}
            value={month}
            onChange={setMonth}
          />
        </div>
      </div>
```

(Resultado: `<div flex>` → `<div inline-flex botones…></div>` + `<div w-48><MonthFilter/></div>` → `</div>`.)

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/finance/ReceivablesTab.tsx
git commit -m "feat: filtro por mes en cuentas por cobrar"
```

---

## Verificación final (manual)

Tras completar los 8 tasks:

- [ ] **Typecheck backend:** `cd backend && npm run build` → PASS.
- [ ] **Typecheck/build frontend:** `cd frontend && npm run build` → PASS.
- [ ] **Prueba manual** (backend + frontend levantados):
  1. **Pagadas:** en Finanzas → Ingresos, las 3 facturas de WEIR MINERALS ya **no**
     aparecen como *Pagado* (ahora *Facturado*).
  2. **Guard:** crear/editar un ingreso eligiendo estado *Pagado* en el formulario lo
     guarda como *Facturado* (no hay fecha de cobro).
  3. **Filtro de mes (Ingresos):** el desplegable ofrece *Enero 2026* y *Febrero 2026*;
     elegir uno filtra la tabla; "Todos los meses" quita el filtro.
  4. **Filtro de mes (Cuentas por cobrar):** mismo comportamiento, combinándose con el
     estado (Por cobrar/Vencidas/etc.).
  5. **Columna Cliente:** la tabla de Ingresos muestra el cliente; al hacer click en uno
     con `clientId`, navega a `/clientes/:id`.
