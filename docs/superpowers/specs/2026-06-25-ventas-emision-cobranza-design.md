# Diseño: Separar emisión de ventas (libro de ventas) de la cobranza

- **Fecha**: 2026-06-25
- **Estado**: Aprobado (pendiente de plan de implementación)
- **Autor**: CEO + Claude
- **Módulos afectados**: `finance-imports`, `finance`, `income`, `clients`, frontend de Finanzas

## 1. Contexto y problema

Al importar el libro de ventas, el indicador "ingresos pendientes y vencidos"
mostró un valor **negativo de −273.822**.

Causa raíz: el sistema mezcla dos hechos distintos en el campo `IncomeRecord.status`:

- **Emisión** — lo que declara el libro de ventas: qué documento se emitió
  (factura, nota de crédito, nota de débito), su monto, fecha y cliente. Es un
  hecho cierto y verificable.
- **Cobranza** — si el documento se pagó, cuándo y cuánto falta. El libro de
  ventas **no** declara esto; es un seguimiento aparte que aún no existe.

El parser adivinaba el estado de pago desde una columna `PAGADO` del libro
(`status: parsePaid('PAGADO') ? 'PAID' : 'INVOICED'`), que no representa cobranza
real. Además, las notas de crédito (monto negativo) quedaban en estado
`INVOICED`, por lo que el KPI de "pendientes" las sumaba (restaba) junto con las
facturas impagas. Como en los datos reales 2 notas de crédito anulaban 2
facturas, el agregado quedó negativo.

### Datos de ejemplo que dispararon el problema

| Tipo | Estado actual | Docs | Suma |
|---|---|---|---|
| Factura (`SALE`) | `INVOICED` | 8 | +11.247.678 |
| Factura (`SALE`) | `PAID` | 3 | +17.282.500 |
| Nota de crédito (`CREDIT_NOTE`) | `INVOICED` | 2 | −11.521.500 |

El libro de ventas **sí** trae la referencia de la factura anulada en cada nota
de crédito (`NRO DOCUMENTO ANULADO`, `TIPO DOCUMENTO ANULADO`, `RAZON REFERENCIA`),
lo que permite vincularlas automáticamente. Las ventas son **exentas de IVA**
(coherente con salud: `NETO: 0`, `EXENTO: <monto>`).

## 2. Objetivos y no-objetivos

### Objetivos

1. Modelar correctamente la **emisión** (libro de ventas) separada de la
   **cobranza** (pagos), en un diseño integrado implementado por fases.
2. Vincular cada nota de crédito a la factura que anula y reducir su monto neto.
3. Permitir el **registro manual** del pago de cada factura (todo o nada).
4. Calcular un vencimiento consistente (**emisión + 1 mes**).
5. Reescribir los KPIs financieros para que "Por cobrar" y "Vencido" sean siempre
   correctos (positivos) y el "Emitido neto" cuadre.

### No-objetivos (de momento)

- Conciliación automática de pagos desde cartola bancaria.
- Pagos parciales / abonos (1 factura → N pagos).
- Plazo de vencimiento configurable por cliente o contrato.
- Migración/backfill complejo de datos históricos (finanzas se repuebla
  reimportando el libro 2026).

## 3. Decisiones de diseño

| Tema | Decisión |
|---|---|
| Alcance | Emisión + cobranza, diseño integrado, implementación por fases |
| Fuente de pagos | Registro manual por factura |
| Pagos parciales | No — pagada o por cobrar (todo o nada) |
| Notas de crédito | Se vinculan a su factura por `NRO DOCUMENTO ANULADO` y la reducen (total o parcial) |
| Vencimiento | `dueDate = fecha de emisión + 1 mes`; vencida si hoy > `dueDate` y no pagada |
| Modelo | Extender `IncomeRecord` (no crear modelo nuevo) |
| Estado de cobranza | **Derivado** de `netAmount`, `paidDate` y `dueDate`; no se usa `status` para ventas |

### Enfoque elegido (Opción A — extender `IncomeRecord`)

Se descartó crear un modelo dedicado `SalesDocument` (Opción B) por el costo de
duplicar toda la pipeline de importación, clientes y resumen. Se descartó una
tabla `PaymentRecord` separada (Opción C) por ser sobre-ingeniería dado que no
hay pagos parciales. `IncomeRecord` ya está orientado a ventas
(`documentKind`, `clientId`, `sourceFolio`), y los ingresos manuales se
distinguen porque no tienen `sourceFolio`.

## 4. Modelo de datos

Cambios sobre `IncomeRecord` (`backend/prisma/schema.prisma`):

### Campos nuevos

- `paidDate: DateTime?` — fecha en que se cobró. `null` = por cobrar.
- `netAmount: Int?` — monto neto por cobrar de una factura tras aplicar sus notas
  de crédito (`= amount + Σ(NC vinculadas)`). Se fija al importar/vincular. Para
  notas de crédito es `null` (no aplica).
- `creditsIncomeId: String?` — auto-relación: en una nota de crédito, apunta a la
  factura que anula (resuelta desde `NRO DOCUMENTO ANULADO`). Relación inversa en
  la factura: `creditedBy: IncomeRecord[]`.

### Auto-relación

```prisma
creditsIncome   IncomeRecord?  @relation("CreditNotes", fields: [creditsIncomeId], references: [id], onDelete: SetNull)
creditedBy      IncomeRecord[] @relation("CreditNotes")
creditsIncomeId String?

@@index([creditsIncomeId])
```

### Estado de cobranza (derivado, no almacenado)

Para documentos de venta (`SALE`/`DEBIT_NOTE`):

| Condición | Estado |
|---|---|
| `netAmount == 0` | Anulada |
| `paidDate != null` | Pagada |
| `netAmount > 0` y `dueDate < hoy` | Vencida |
| resto | Por cobrar |

El campo `status` (`IncomeStatus`) deja de ser la fuente de verdad para ventas;
se mantiene para ingresos manuales. No se usa `CANCELLED` para facturas anuladas
(causaría descuadre en el neto emitido: la factura excluida no sumaría pero su NC
sí restaría).

### Migración

Agregar las 3 columnas + índice en `creditsIncomeId`. Sin backfill complejo: se
limpia y reimporta el libro 2026 (importación idempotente por `dedupeKey`).

## 5. Importación del libro de ventas

### Parser (`finance-imports.parser.ts`)

- **Eliminar** la adivinanza de pago. Toda factura y nota de débito entra como
  emitida/por cobrar; la columna `PAGADO` se ignora.
- Extraer `NRO DOCUMENTO ANULADO` y `TIPO DOCUMENTO ANULADO` para las notas de
  crédito y guardarlos en `data` (el tipo se usa para desambiguar el vínculo, ver
  más abajo).
- Calcular `dueDate = incomeDate + 1 mes`. **Se descarta intencionalmente** la
  columna `FECHA VENCIMIENTO DOCUMENTO` del libro (viene vacía y el plazo es fijo
  de 1 mes; ver no-objetivos).
- Omitir filas con `EMITIDO != "SI"` (no son ventas válidas).

### Service — confirmación (`finance-imports.service.ts`)

Vinculación NC→factura en **dos pasadas** dentro de la transacción (la NC puede
venir antes que su factura en el mismo lote):

1. Insertar todos los documentos. Las facturas/ND con `netAmount = amount`.
2. Para cada nota de crédito, buscar la factura candidata filtrando por
   `organizationId`, `documentKind IN (SALE, DEBIT_NOTE)` y
   `sourceFolio = NRO DOCUMENTO ANULADO`. Como **no** existe constraint único en
   `(organizationId, sourceFolio)`, hay que resolver posibles múltiples coincidencias:
   - **Una coincidencia** → setear `creditsIncomeId`; recalcular el `netAmount` de
     la factura (`amount + Σ NC`). Puede quedar en 0 (anulación total) o > 0
     (parcial).
   - **Varias coincidencias** → desempatar usando `TIPO DOCUMENTO ANULADO`
     (mapeado al tipo de documento) y, si persiste el empate, elegir la de
     `incomeDate` más reciente y agregar una **advertencia** al lote indicando la
     ambigüedad.
   - **Ninguna coincidencia** (factura de un período anterior no importado) → la
     NC queda con `creditsIncomeId = null` y se agrega una **advertencia** al lote.
     No bloquea la importación. Su monto negativo afecta el emitido neto agregado
     pero no reduce una factura puntual.

## 6. Cobranza (registro manual)

### Backend (`income` module, patrón de 4 archivos)

- Endpoint: `PATCH /api/income/:id/payment`, body `{ paidDate: string | null }`.
  - Con fecha → `paidDate = fecha`.
  - Con `null` → revierte a por cobrar (`paidDate = null`).
- Validación en el service: solo `SALE`/`DEBIT_NOTE`; rechaza (`badRequest`) si es
  nota de crédito o si la factura está anulada (`netAmount == 0`).
- Extender el listado (`income.service`/`schema`) con filtros `paymentState`
  (por cobrar / vencida / pagada / anulada) y `documentKind`.

### Frontend — pestaña "Cuentas por cobrar" en `FinancePage`

Tabla global de facturas (todas las empresas/clientes) con:

- Columnas: Empresa, Cliente, Folio, Emisión, Vence, Neto, Estado, Acción.
- Filtros: empresa, cliente, estado de cobranza, rango de fechas.
- Totales en el encabezado: "Por cobrar" y "Vencido".
- Acción por fila: "Marcar pagada" (selector de fecha, por defecto hoy) /
  "Revertir".

## 7. KPIs y resumen financiero (`finance.service.ts`)

Reescritura, solo sobre facturas (`SALE`/`DEBIT_NOTE`), excluyendo notas de crédito:

- **Por cobrar** = Σ `netAmount` con `paidDate` nulo y `netAmount > 0`.
- **Vencido** = lo anterior con `dueDate < hoy`.
- **Cobrado** = Σ `netAmount` con `paidDate` presente.
- **Emitido neto del mes** = Σ `amount` de todos los documentos del mes (facturas
  + NC, que restan), agrupando por `incomeDate` (igual que `currentMonthRange()`
  actual). Queda en 0 para una factura totalmente anulada → sin descuadre. Nota:
  una NC emitida en un mes posterior a su factura desplaza el neteo entre meses;
  es un comportamiento aceptado.

Con esto, el caso original (−273.822) pasa a mostrar "Por cobrar" = solo facturas
con neto > 0 impagas, siempre positivo.

## 8. Frontend (resto)

- **Tipos** (`types/domain.ts`): añadir `netAmount`, `paidDate`,
  `creditsIncomeId` a `IncomeRecord`; ajustar `FinanceSummary` con los KPIs
  nuevos.
- **Resumen financiero** (`FinanceSummaryTab`) y **Dashboard**: muestran
  "Por cobrar / Vencido / Cobrado / Emitido neto" con la semántica corregida.
- **Hook** `useRegisterPayment` (PATCH `/income/:id/payment`) que invalida
  `finance`, `clients` y `dashboard` (patrón de invalidación del proyecto).
- **Tab de importaciones** (`FinanceImportsTab`): mostrar las advertencias de NC
  sin factura vinculada.

## 9. Manejo de errores y casos borde

- **NC sin factura encontrada**: advertencia en el lote, NC sin vincular, no
  bloquea.
- **NC parcial** (`|NC| < factura`): `netAmount > 0`, la factura sigue por cobrar
  por el neto reducido.
- **NC total** (`|NC| == factura`): `netAmount == 0`, estado derivado "Anulada",
  excluida de cobranza; el emitido neto cuadra en 0.
- **Reversión de pago**: `paidDate = null` devuelve la factura a por cobrar.
- **Pago sobre NC o factura anulada**: rechazado con `badRequest`.

## 10. Verificación

No hay framework de tests; el typecheck es la verificación oficial.

- `npm run build` (backend) y `npm run lint` (frontend) en verde.
- Prueba manual: reimportar el libro 2026 → "Por cobrar" positivo; marcar una
  factura pagada → baja "Por cobrar"; una NC total → factura "Anulada" y neto del
  mes cuadra.

## 11. Plan por fases

1. **Fase 1 — Modelo + importación**: migración (`netAmount`, `paidDate`,
   `creditsIncomeId`), parser (sin adivinar pago, `dueDate = emisión + 1 mes`,
   extraer doc anulado), service (vinculación NC→factura en dos pasadas).
   *Deja el KPI base correcto.*
2. **Fase 2 — KPIs + UI de resumen**: reescritura de `finance.service`, tipos,
   `FinanceSummaryTab`, Dashboard.
3. **Fase 3 — Cobranza**: endpoint `PATCH /income/:id/payment`, filtros de
   listado, pestaña "Cuentas por cobrar".

Tras la Fase 1 se limpia y reimporta el libro 2026 para poblar los campos nuevos.
