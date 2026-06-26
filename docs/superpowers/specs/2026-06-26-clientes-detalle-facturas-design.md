# Detalle de cliente con sus facturas

**Fecha:** 2026-06-26
**Estado:** Aprobado (diseño)
**Rama:** `feat/clientes-detalle-facturas`

## Objetivo

Desde la lista de Clientes (`/clientes`), poder **abrir un cliente** y ver una página
con **todas las facturas y notas de crédito asociadas** a ese cliente, con la opción
de **marcar una factura como pagada** (o revertir el pago) sin salir de la página.

Los clientes ya se crean/actualizan automáticamente al importar el libro de ventas;
esta feature solo agrega la vista de detalle que hoy falta.

## Contexto: qué ya existe

- **Backend completo.** `GET /clients/:id` (`clients.service.ts → getClient`) ya
  devuelve el cliente con su organización, sus `incomes` (hasta 300, ordenados por
  `sourceIssueDate desc`, luego `createdAt desc`) y los `stats` derivados
  (`netSales`, `grossInvoiced`, `totalCreditNotes`, `invoiceCount`,
  `creditNoteCount`, `documentCount`, `lastDocumentDate`). **No requiere cambios.**
- **Hooks frontend.** `useClientDetail(id)` y `useRegisterPayment()` ya existen.
  `useRegisterPayment` ya invalida `['clients']` en `onSuccess`, por lo que marcar
  pagada refresca el detalle automáticamente. **No requieren cambios.**
- **Tipos.** `ClientDetail extends Client { incomes: IncomeRecord[] }` ya existe.
- **Lista.** `ClientsPage.tsx` muestra la tabla de clientes con stats, pero las filas
  **no son clickeables** y no hay ruta ni componente de detalle.

## Alcance

**Incluye:**
1. Ruta `/clientes/:id`.
2. Filas de la lista de clientes clickeables → navegan al detalle.
3. Página de detalle `ClientDetailPage` con cabecera, stats y tabla de documentos.
4. Marcar pagada / revertir pago desde la tabla del detalle (reusando lo existente).

**No incluye (YAGNI):**
- Paginación de facturas (el cap de 300 del backend basta para un cliente).
- Filtros internos en la página de detalle.
- Edición del cliente (nombre/RUT) o de las facturas.
- Cambios de backend.

## Cambios por archivo

### 1. `frontend/src/types/domain.ts`
Agregar el campo opcional `sourceIssueDate: string | null` a la interfaz
`IncomeRecord`. El backend ya lo devuelve (es la fecha real de emisión del libro de
ventas); el tipo simplemente no lo declaraba. Se usará como fecha principal del
documento, con *fallback* a `incomeDate`.

### 2. `frontend/src/App.tsx`
Importar `ClientDetailPage` y añadir, dentro del bloque protegido (`ProtectedRoute` +
`AppLayout`), la ruta:
```tsx
<Route path="/clientes/:id" element={<ClientDetailPage />} />
```
Va junto a la ruta existente `/clientes`.

### 3. `frontend/src/pages/clients/ClientsPage.tsx`
Hacer cada `<tr>` de cliente navegable a `/clientes/${c.id}`:
- Usar `useNavigate` de `react-router-dom`.
- `onClick` en la fila + `className` con `cursor-pointer` (el `hover` ya existe).
No se cambia ninguna columna ni el cálculo de totales.

### 4. `frontend/src/pages/clients/ClientDetailPage.tsx` (nuevo)
Componente de página. Estructura:

- **Datos:** `const { id } = useParams()`; `useClientDetail(id)`;
  `const registrar = useRegisterPayment()`.
- **Estados:** `Spinner` mientras carga, `ErrorState` (con `getErrorMessage`) en
  error, y un `EmptyState` "Sin documentos" si el cliente no tiene `incomes`.
- **Cabecera (`PageHeader`):** título = nombre del cliente; descripción = `RUT ·
  empresa`. Incluir un enlace/botón "← Volver" a `/clientes` (con `Link` o
  `useNavigate`).
- **Stats (`MetricCard`, grid responsive `sm:grid-cols-2 lg:grid-cols-4`):**
  Venta neta (`stats.netSales`), Bruto facturado
  (`stats.grossInvoiced`), Notas de crédito (`stats.totalCreditNotes`, tono
  `warning` si > 0), N.º facturas (`stats.invoiceCount`).
- **Tabla de documentos (`incomes`):** columnas
  `Folio` (`sourceFolio ?? '—'`) ·
  `Fecha` (`sourceIssueDate ?? incomeDate`, con `formatDate`) ·
  `Tipo` (Factura / NC según `documentKind`) ·
  `Descripción` (`description`) ·
  `Bruto` (`amount`, con `formatMoney`) ·
  `Neto` (`netAmount ?? amount`) ·
  `Estado` (badge derivado, ver abajo) ·
  `Acción`.
- **Estado de cobro derivado** — helper **nuevo y local** a esta página (no existe
  uno reusable: `ReceivablesTab` filtra por estado en el servidor vía
  `paymentState`, no calcula un badge en cliente). Las reglas se alinean
  deliberadamente con la semántica del backend (`income.service.ts`) para que el
  detalle y Cuentas por cobrar **no se contradigan**. Precedencia, solo para
  documentos que **no** son nota de crédito:
  - `netAmount === 0` → **Anulada** (misma regla que `paymentState='cancelled'`).
  - tiene `paidDate` → **Pagada** (backend: `paidDate != null` y `status != CANCELLED`;
    como ya excluimos `netAmount === 0` arriba, basta con `paidDate`).
  - `dueDate` existe y `< hoy` (y sin `paidDate`) → **Vencida**.
  - en otro caso → **Por cobrar**.
  - **Notas de crédito** (`documentKind === 'CREDIT_NOTE'`): no llevan estado de
    cobro; la columna Estado muestra `'—'` (su naturaleza ya se ve en la columna Tipo).
- **Acción de pago:** para documentos que **no** son nota de crédito
  (`documentKind !== 'CREDIT_NOTE'`; las notas de débito sí son cobrables y por tanto
  muestran acción, lo cual es intencional):
  - sin `paidDate` → botón "Marcar pagada" →
    `registrar.mutate({ id: r.id, paidDate: new Date().toLocaleDateString('en-CA') })`
    (fecha **local** YYYY-MM-DD, igual que en `ReceivablesTab`, para no registrar el
    día anterior por desfase UTC).
  - con `paidDate` → botón "Revertir" → `registrar.mutate({ id: r.id, paidDate: null })`.
  - botones `disabled={registrar.isPending}`.
  - Las notas de crédito no muestran acción de pago.
- **Error de la mutación:** `ErrorState` con `getErrorMessage(registrar.error)` si
  `registrar.isError`.

## Flujo de datos

```
Lista /clientes (useClients)
   └─ click fila ─▶ navigate(/clientes/:id)
ClientDetailPage (useParams → useClientDetail(id))
   └─ GET /clients/:id ─▶ { ...client, organization, incomes[], stats }
   └─ "Marcar pagada" ─▶ useRegisterPayment → PATCH /income/:id/payment
            └─ onSuccess invalida ['clients'] ─▶ refetch del detalle
```

## Manejo de errores y casos borde

- **Cliente inexistente:** el backend responde 404 ("Cliente no encontrado");
  la página muestra `ErrorState` con ese mensaje.
- **Cliente sin facturas:** `EmptyState` (no debería ocurrir si vino de la lista,
  pero se cubre).
- **Notas de crédito:** monto negativo; se muestran en la tabla, sin acción de pago.
  Ya están contempladas en los `stats` (restan del neto).
- **Fechas nulas:** `sourceFolio`, `sourceIssueDate`, `incomeDate`, `dueDate` pueden
  ser `null` → se muestra `'—'`.
- **Desfase de zona horaria** al marcar pagada: se usa fecha local `'en-CA'`
  (YYYY-MM-DD), no `toISOString()`.

## Verificación

No hay framework de tests; la verificación es el typecheck:
- `cd frontend && npm run lint` (tsc --noEmit) debe pasar.
- Prueba manual: importar/usar un cliente con facturas, abrirlo desde la lista,
  ver sus documentos, marcar una factura como pagada y confirmar que el estado y los
  stats se actualizan; revertir el pago.
