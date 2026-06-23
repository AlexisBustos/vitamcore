# Diseno: importacion financiera mensual

Fecha: 2026-06-23  
Producto: Vitam Core  
Modulo: Finanzas

## Contexto

El modulo de finanzas hoy permite registrar manualmente ingresos y gastos ejecutivos mediante `IncomeRecord` y `ExpenseRecord`. La pagina `/finanzas` tiene pestanas de resumen, ingresos y gastos, y el backend expone modulos separados para `finance`, `income` y `expenses`.

El nuevo flujo debe permitir cargar mensualmente tres tipos de archivos:

- Reporte de ventas de Centro Medico Vitam, con hojas `DETALLE` y `RESUMEN`.
- Reporte de compras de Centro Medico Vitam, con hojas `DETALLE` y `RESUMEN`.
- Cartola bancaria `.xls`, asociada a una cuenta bancaria especifica.

La empresa y la cuenta bancaria no se inferiran automaticamente: el usuario las seleccionara antes de subir cada archivo.

## Objetivos

- Subir archivos mensuales desde la pantalla de Finanzas.
- Mostrar vista previa antes de guardar registros definitivos.
- Confirmar manualmente la importacion despues de revisar totales, filas validas, advertencias y duplicados.
- Convertir ventas confirmadas en ingresos y compras confirmadas en gastos.
- Guardar movimientos de cartola separados por cuenta bancaria.
- Evitar duplicados cuando se vuelva a subir el mismo archivo o el mismo periodo.
- Mantener trazabilidad del archivo, periodo, empresa, cuenta y resumen de importacion.

## Fuera de alcance inicial

- Conciliacion automatica entre facturas y cartolas.
- Edicion destructiva de importaciones confirmadas.
- Contabilidad formal de doble partida.
- Deteccion automatica de empresa desde el nombre o contenido del archivo.
- Almacenamiento permanente del binario original en S3/R2.

## Modelo de datos propuesto

### `BankAccount`

Representa una cuenta bancaria usable en importaciones de cartola.

Campos sugeridos:

- `id`
- `organizationId`
- `name`
- `bankName`
- `accountNumber`
- `currency` por defecto `CLP`
- `isActive`
- `createdAt`
- `updatedAt`

Restricciones:

- Unica por `organizationId + accountNumber`.
- Indices por `organizationId` e `isActive`.

### `FinancialImportBatch`

Representa un lote de importacion mensual.

Campos sugeridos:

- `id`
- `organizationId`
- `bankAccountId` opcional
- `type`: `SALES_REPORT`, `PURCHASE_REPORT`, `BANK_STATEMENT`
- `status`: `PREVIEW`, `CONFIRMED`, `FAILED`
- `periodMonth`: fecha normalizada al primer dia del mes
- `originalFileName`
- `fileSize`
- `sourceHash`
- `rowsTotal`
- `rowsValid`
- `rowsSkipped`
- `rowsDuplicated`
- `totalIncome`
- `totalExpense`
- `totalCharges`
- `totalCredits`
- `warnings` como `Json`
- `previewData` como `Json` para guardar filas normalizadas antes de confirmar
- `createdAt`
- `confirmedAt`

Restricciones:

- Indices por `organizationId`, `type`, `periodMonth`, `status`.
- `sourceHash` permite detectar cargas identicas del mismo archivo.
- Los lotes en `PREVIEW` pueden reemplazarse si el usuario vuelve a generar la vista previa antes de confirmar.

### `BankTransaction`

Representa un movimiento bancario importado desde cartola.

Campos sugeridos:

- `id`
- `organizationId`
- `bankAccountId`
- `importBatchId`
- `transactionDate`
- `description`
- `channel`
- `documentNumber`
- `chargeAmount`
- `creditAmount`
- `balance`
- `currency`
- `rawData` como `Json`
- `dedupeKey`
- `createdAt`

Restricciones:

- Unica por `bankAccountId + dedupeKey`.
- Indices por `organizationId`, `bankAccountId`, `transactionDate`.

### Trazabilidad en ingresos y gastos

Agregar campos opcionales a `IncomeRecord` y `ExpenseRecord`:

- `importBatchId`
- `sourceDocumentType`
- `sourceFolio`
- `sourceRut`
- `sourceIssueDate`
- `sourceDedupeKey`
- `rawData` como `Json`

Restricciones:

- `sourceDedupeKey` unico cuando exista, para evitar duplicados por documento.

## Mapeo de archivos

### Ventas

Origen: hoja `DETALLE`.

Mapeo a `IncomeRecord`:

- `organizationId`: seleccionado por el usuario.
- `clientName`: `RAZON SOCIAL`.
- `description`: `DOCUMENTO` + `FOLIO`.
- `amount`: `TOTAL`.
- `currency`: `TIPO DE MONEDA` si existe; si viene vacio, `CLP`.
- `category`: `Ventas`.
- `status`: `PAID` si `PAGADO = SI`; si no, `INVOICED`.
- `incomeDate`: `FECHA`.
- `dueDate`: `FECHA VENCIMIENTO DOCUMENTO` si existe; si no, `FECHA`.
- `sourceDocumentType`: `DOCUMENTO`.
- `sourceFolio`: `FOLIO`.
- `sourceRut`: `RUT`.
- `rawData`: fila original normalizada.

Notas de credito se importan con monto negativo si el `TOTAL` viene negativo. No se invierte el signo.

### Compras

Origen: hoja `DETALLE`.

Mapeo a `ExpenseRecord`:

- `organizationId`: seleccionado por el usuario.
- `vendorName`: `RAZON SOCIAL`.
- `description`: `DOCUMENTO` + `FOLIO`.
- `amount`: `TOTAL`.
- `currency`: `CLP`.
- `category`: `Compras`.
- `status`: `PAID` si `PAGADO = SI`; si no, `PENDING`.
- `expenseDate`: `FECHA DOCUMENTO`.
- `dueDate`: `FECHA VENCIMIENTO` si existe.
- `sourceDocumentType`: `DOCUMENTO`.
- `sourceFolio`: `FOLIO`.
- `sourceRut`: `RUT`.
- `rawData`: fila original normalizada.

Notas de credito se importan con monto negativo si el `TOTAL` viene negativo. No se invierte el signo.

### Cartola bancaria

Origen: archivo `.xls` asociado a una cuenta bancaria seleccionada.

Mapeo a `BankTransaction`:

- `organizationId`: seleccionado por el usuario.
- `bankAccountId`: seleccionado por el usuario.
- `transactionDate`: columna de fecha contable o fecha de movimiento.
- `description`: descripcion/glosa del movimiento.
- `channel`: canal o sucursal.
- `documentNumber`: numero de documento si existe.
- `chargeAmount`: cargos.
- `creditAmount`: abonos.
- `balance`: saldo.
- `currency`: `CLP` salvo que el archivo indique otra moneda.
- `rawData`: fila original normalizada.

Los cargos y abonos se guardan separados para mantener claridad bancaria. La cartola no crea ingresos ni gastos automaticamente en esta primera version.

## Flujo backend

Nuevo modulo: `backend/src/modules/finance-imports/`

Archivos siguiendo la convencion del repo:

- `finance-imports.routes.ts`
- `finance-imports.controller.ts`
- `finance-imports.service.ts`
- `finance-imports.schema.ts`
- `finance-imports.parser.ts`

Endpoints bajo `/api/finance/imports`:

- `GET /accounts`: lista cuentas bancarias.
- `POST /accounts`: crea cuenta bancaria.
- `PATCH /accounts/:id`: actualiza cuenta bancaria.
- `POST /preview`: recibe empresa, periodo, tipo, cuenta opcional y archivo; crea un lote `PREVIEW` con filas normalizadas y devuelve resumen sin crear registros financieros definitivos.
- `POST /confirm`: recibe `batchId`, confirma una vista previa persistida y crea `IncomeRecord`, `ExpenseRecord` o `BankTransaction`.
- `GET /batches`: lista lotes historicos.
- `GET /batches/:id`: detalle de lote.

La confirmacion debe ejecutarse en transaccion Prisma. Si una fila esta duplicada, no debe insertarse y debe quedar contada como duplicada.

Dependencias backend previstas:

- Parser de planillas compatible con `.xlsx` y `.xls`, usando lectura pasiva de archivos.
- Middleware de `multipart/form-data` para recibir uploads temporales en memoria o directorio temporal.
- No se debe abrir el `.xls` con Excel/COM ni ejecutar macros, enlaces externos o automatizaciones del archivo.

## Flujo frontend

Agregar pestana `Importaciones` en `/finanzas`.

Componentes sugeridos:

- `FinanceImportsTab`
- `ImportPreviewPanel`
- `BankAccountsPanel`

Controles:

- Selector de empresa.
- Selector de periodo mensual.
- Selector de tipo de archivo.
- Selector de cuenta bancaria solo cuando el tipo sea cartola.
- Input de archivo.
- Boton `Vista previa`.
- Resumen de totales y advertencias.
- Tabla de filas de preview con estado: valida, advertencia, duplicada, error.
- Boton `Confirmar importacion`.

Hooks:

- `useBankAccounts`
- `useCreateBankAccount`
- `useFinanceImportPreview`
- `useConfirmFinanceImport`
- `useFinanceImportBatches`

Al confirmar, invalidar query keys de `income`, `expenses`, `finance`, `dashboard` y `finance-imports`.

## Validacion y errores

- Rechazar archivos sin empresa seleccionada.
- Rechazar cartolas sin cuenta bancaria seleccionada.
- Validar que la hoja `DETALLE` exista para ventas y compras.
- Validar columnas requeridas antes de parsear filas.
- Mostrar advertencias por filas sin fecha, monto o identificador tributario.
- Rechazar confirmacion si la vista previa contiene errores bloqueantes.
- Nunca devolver stack traces al frontend; usar el middleware central de errores.

## Duplicados

Ventas y compras:

`organizationId + type + sourceDocumentType + sourceFolio + sourceRut + sourceIssueDate + amount`

Cartolas:

`bankAccountId + transactionDate + documentNumber + description + chargeAmount + creditAmount + balance`

Los valores se normalizan antes de construir la clave: trim, mayusculas, fechas ISO y montos enteros.

## Verificacion

Como el repo no tiene framework de tests configurado, se agregaran tests de parser con `node:test` ejecutados via `tsx --test`, sin cambiar el contrato de verificacion existente.

Comandos finales esperados:

- Backend: `npm run build`
- Frontend: `npm run lint`
- Parser: comando especifico `tsx --test` para casos de ventas, compras y cartola cuando el parser este implementado.

## Riesgos

- El archivo `.xls` de cartola es binario antiguo. Se debe parsear con una dependencia de lectura segura en backend, no abrirlo con Excel ni ejecutar macros.
- Si el formato de cartola cambia entre bancos o cuentas, el parser debe fallar con mensaje claro y no insertar datos parciales.
- La primera version no concilia pagos contra facturas; el usuario vera facturas y cartolas separadas hasta una fase posterior.

## Criterios de aceptacion

- El usuario puede crear o seleccionar dos cuentas bancarias separadas.
- El usuario puede previsualizar ventas, compras y cartola antes de confirmar.
- La confirmacion crea ingresos, gastos o movimientos bancarios segun corresponda.
- Re-subir el mismo archivo no duplica registros.
- El resumen financiero refleja ingresos y gastos importados despues de confirmar.
- Las cartolas quedan filtrables por empresa, cuenta y periodo.
