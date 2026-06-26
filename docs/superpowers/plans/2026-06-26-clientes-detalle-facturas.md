# Detalle de cliente con sus facturas — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una página de detalle de cliente (`/clientes/:id`) que liste todas sus facturas y notas de crédito, con opción de marcar pagada / revertir el pago.

**Architecture:** Feature 100% frontend. El backend (`GET /clients/:id`) ya devuelve el cliente con sus `incomes` y `stats`; los hooks `useClientDetail` y `useRegisterPayment` ya existen. Se agrega un componente de página nuevo, una ruta, se hacen clickeables las filas de la lista y se expone un campo ya devuelto por el backend en el tipo del frontend.

**Tech Stack:** React + Vite + TanStack Query + React Router + Tailwind CSS v4 (TypeScript).

**Nota sobre verificación:** El proyecto **no tiene framework de tests**; la verificación es el typecheck (`npm run lint` en `frontend/`, que corre `tsc --noEmit`) más una prueba manual al final. Los pasos siguen el ciclo bite-sized del skill, sustituyendo "test runner" por "typecheck".

**Spec:** `docs/superpowers/specs/2026-06-26-clientes-detalle-facturas-design.md`

---

## File Structure

- **Modify** `frontend/src/types/domain.ts` — exponer `sourceIssueDate` en `IncomeRecord` (el backend ya lo devuelve).
- **Create** `frontend/src/pages/clients/ClientDetailPage.tsx` — página de detalle: cabecera, stats, tabla de documentos, acción de pago. Responsabilidad única: mostrar un cliente y sus documentos.
- **Modify** `frontend/src/App.tsx` — registrar la ruta `/clientes/:id`.
- **Modify** `frontend/src/pages/clients/ClientsPage.tsx` — filas de la tabla navegables al detalle.

---

## Chunk 1: Detalle de cliente

### Task 1: Exponer `sourceIssueDate` en el tipo `IncomeRecord`

**Files:**
- Modify: `frontend/src/types/domain.ts` (interfaz `IncomeRecord`, ~línea 221)

- [ ] **Step 1: Agregar el campo**

En la interfaz `IncomeRecord`, junto a `sourceFolio`, agrega la línea `sourceIssueDate`:

```ts
  netAmount: number | null;
  paidDate: string | null;
  creditsIncomeId: string | null;
  sourceFolio: string | null;
  sourceIssueDate: string | null;
  createdAt: string;
  updatedAt: string;
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (0 errores). El campo es opcional en uso; nada más lo consume todavía.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/domain.ts
git commit -m "feat: expone sourceIssueDate en el tipo IncomeRecord"
```

---

### Task 2: Crear `ClientDetailPage`

**Files:**
- Create: `frontend/src/pages/clients/ClientDetailPage.tsx`

- [ ] **Step 1: Crear el componente completo**

Crea `frontend/src/pages/clients/ClientDetailPage.tsx` con exactamente este contenido:

```tsx
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useClientDetail } from '@/hooks/useClients';
import { useRegisterPayment } from '@/hooks/useFinance';
import type { IncomeRecord } from '@/types/domain';

type EstadoCobro = 'paid' | 'overdue' | 'receivable' | 'cancelled';

const ESTADO_LABEL: Record<EstadoCobro, string> = {
  paid: 'Pagada',
  overdue: 'Vencida',
  receivable: 'Por cobrar',
  cancelled: 'Anulada',
};

const ESTADO_CLASS: Record<EstadoCobro, string> = {
  paid: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  overdue: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  receivable: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  cancelled: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

// Estado de cobro derivado, alineado con income.service.ts (paymentState):
// anulada = netAmount 0; pagada = tiene paidDate; vencida = dueDate pasado sin pago.
function estadoCobro(inc: IncomeRecord): EstadoCobro {
  if (inc.netAmount === 0) return 'cancelled';
  if (inc.paidDate) return 'paid';
  if (inc.dueDate && new Date(inc.dueDate) < new Date()) return 'overdue';
  return 'receivable';
}

export function ClientDetailPage() {
  const { id } = useParams();
  const { data: client, isLoading, isError, error } = useClientDetail(id);
  const registrar = useRegisterPayment();

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/clientes"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a clientes
        </Link>
      </div>

      {isLoading && <Spinner label="Cargando cliente…" />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {client && (
        <>
          <PageHeader
            title={client.name}
            description={`${client.rut} · ${client.organization?.name ?? '—'}`}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Venta neta"
              value={formatMoney(client.stats.netSales)}
            />
            <MetricCard
              title="Bruto facturado"
              value={formatMoney(client.stats.grossInvoiced)}
            />
            <MetricCard
              title="Notas de crédito"
              value={formatMoney(client.stats.totalCreditNotes)}
              tone={client.stats.totalCreditNotes > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              title="Facturas"
              value={String(client.stats.invoiceCount)}
            />
          </div>

          {client.incomes.length === 0 ? (
            <EmptyState title="Sin documentos">
              Este cliente aún no tiene facturas ni notas de crédito asociadas.
            </EmptyState>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
                <FileText className="h-5 w-5 text-[var(--color-primary)]" />
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                  Documentos ({client.incomes.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Folio</th>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 text-right font-medium">Bruto</th>
                      <th className="px-4 py-3 text-right font-medium">Neto</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {client.incomes.map((inc) => {
                      const esNC = inc.documentKind === 'CREDIT_NOTE';
                      const estado = estadoCobro(inc);
                      return (
                        <tr
                          key={inc.id}
                          className="hover:bg-[var(--color-muted)]/40"
                        >
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {inc.sourceFolio ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {formatDate(inc.sourceIssueDate ?? inc.incomeDate)}
                          </td>
                          <td className="px-4 py-3">{esNC ? 'NC' : 'Factura'}</td>
                          <td className="px-4 py-3">{inc.description}</td>
                          <td className="px-4 py-3 text-right">
                            {formatMoney(inc.amount)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatMoney(inc.netAmount ?? inc.amount)}
                          </td>
                          <td className="px-4 py-3">
                            {esNC ? (
                              <span className="text-[var(--color-muted-foreground)]">
                                —
                              </span>
                            ) : (
                              <Badge className={ESTADO_CLASS[estado]}>
                                {ESTADO_LABEL[estado]}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {esNC ? (
                              <span className="text-[var(--color-muted-foreground)]">
                                —
                              </span>
                            ) : inc.paidDate ? (
                              <Button
                                variant="outline"
                                onClick={() =>
                                  registrar.mutate({ id: inc.id, paidDate: null })
                                }
                                disabled={registrar.isPending}
                              >
                                Revertir
                              </Button>
                            ) : (
                              <Button
                                onClick={() =>
                                  registrar.mutate({
                                    id: inc.id,
                                    // Fecha LOCAL (YYYY-MM-DD); no toISOString() para
                                    // no registrar el día anterior por desfase UTC.
                                    paidDate: new Date().toLocaleDateString('en-CA'),
                                  })
                                }
                                disabled={registrar.isPending}
                              >
                                Marcar pagada
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {registrar.isError && (
            <ErrorState message={getErrorMessage(registrar.error)} />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (0 errores). El componente compila aunque aún no esté ruteado.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/clients/ClientDetailPage.tsx
git commit -m "feat: pagina de detalle de cliente con sus documentos"
```

---

### Task 3: Registrar la ruta `/clientes/:id`

**Files:**
- Modify: `frontend/src/App.tsx` (import ~línea 13; ruta ~línea 42)

- [ ] **Step 1: Importar el componente**

Junto al import existente de `ClientsPage`, agrega:

```tsx
import { ClientDetailPage } from '@/pages/clients/ClientDetailPage';
```

- [ ] **Step 2: Agregar la ruta**

Inmediatamente después de la línea `<Route path="/clientes" element={<ClientsPage />} />`, agrega:

```tsx
<Route path="/clientes/:id" element={<ClientDetailPage />} />
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (0 errores).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: ruta /clientes/:id para el detalle de cliente"
```

---

### Task 4: Hacer clickeables las filas de la lista de clientes

**Files:**
- Modify: `frontend/src/pages/clients/ClientsPage.tsx` (import; componente; `<tr>` ~línea 99)

- [ ] **Step 1: Importar `useNavigate`**

En la línea superior del archivo, agrega el import de React Router:

```tsx
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Obtener `navigate` dentro del componente**

Justo después de `const [filters, setFilters] = useState<ClientFilters>({});`, agrega:

```tsx
  const navigate = useNavigate();
```

- [ ] **Step 3: Hacer la fila navegable**

Reemplaza la apertura de la fila:

```tsx
                  <tr key={c.id} className="hover:bg-[var(--color-muted)]/40">
```

por:

```tsx
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="cursor-pointer hover:bg-[var(--color-muted)]/40"
                  >
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (0 errores).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/clients/ClientsPage.tsx
git commit -m "feat: filas de clientes navegan al detalle"
```

---

## Verificación final (manual)

Tras completar los 4 tasks:

- [ ] **Typecheck global frontend**

Run: `cd frontend && npm run build`
Expected: PASS (`tsc --noEmit && vite build` sin errores).

- [ ] **Prueba manual** (con backend + frontend levantados y datos de ventas importados)
  1. Ir a `/clientes`, hacer click en una fila → navega a `/clientes/:id`.
  2. Verificar cabecera (nombre, RUT, empresa), las 4 tarjetas de stats y la tabla de documentos.
  3. En una factura por cobrar, "Marcar pagada" → la fila pasa a **Pagada** y el botón a "Revertir"; los stats se mantienen coherentes.
  4. "Revertir" → vuelve a **Por cobrar**.
  5. Confirmar que las notas de crédito muestran `—` en Estado y Acción.
  6. "Volver a clientes" regresa a la lista.
