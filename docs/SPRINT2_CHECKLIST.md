# Checklist de validación — Sprint 2

Módulos ejecutivos: Ventas, Finanzas (Ingresos + Gastos), Documentos y Decisiones.

## Datos y arranque

- [ ] `npm run prisma:migrate` aplica la migración `sprint2_executive_modules`.
- [ ] `npm run prisma:seed` carga: 5 oportunidades, 5 ingresos, 5 gastos, 3 documentos, 3 decisiones.
- [ ] Backend y frontend levantan sin errores.

## Ventas

- [ ] La página Ventas lista las oportunidades con KPIs (abiertas, monto, ponderado, sin seguimiento).
- [ ] Puedo crear una oportunidad asociada a empresa, unidad y proyecto.
- [ ] Puedo editar una oportunidad y cambiar su estado.
- [ ] Filtros funcionan: empresa, estado, producto/servicio, sin seguimiento.
- [ ] El monto ponderado refleja monto × probabilidad.
- [ ] No puedo asociar una unidad/proyecto de otra empresa (error 400).

## Finanzas

- [ ] La página Finanzas tiene tabs Resumen / Ingresos / Gastos.
- [ ] El tab Resumen muestra ingresos/gastos del mes, resultado, pendientes, recurrentes, vencidos.
- [ ] Muestra desglose por empresa y por categoría, y vencimientos próximos.
- [ ] Puedo crear y editar ingresos (con recurrencia opcional).
- [ ] Puedo crear y editar gastos (con recurrencia opcional).
- [ ] Filtros por categoría y estado funcionan en cada tab.
- [ ] El filtro de empresa de la cabecera aplica a los tres tabs.

## Documentos

- [ ] La página Documentos lista los documentos en tarjetas.
- [ ] Puedo crear un documento asociado a empresa, unidad, proyecto y cliente.
- [ ] Puedo agregar etiquetas (separadas por coma).
- [ ] El resumen IA (`aiSummary`) se muestra cuando existe.
- [ ] Filtros por empresa, tipo y cliente funcionan.
- [ ] Los campos de archivo (`fileName`, `fileUrl`) quedan preparados para S3/R2 (ver `STORAGE.md`).

## Decisiones

- [ ] La página Decisiones lista las decisiones con contexto, fundamento, riesgos y próximo paso.
- [ ] Puedo crear y editar una decisión.
- [ ] Filtros por empresa y estado funcionan.

## Dashboard

- [ ] Muestra ingresos/gastos del mes y resultado estimado reales.
- [ ] Muestra ventas abiertas, monto abierto y monto ponderado.
- [ ] Muestra ingresos/gastos pendientes y vencidos.
- [ ] Muestra decisiones activas y documentos recientes.
- [ ] Muestra próximos seguimientos comerciales.
- [ ] El selector Consolidado / por empresa cambia todas las métricas.

## Calidad técnica

- [ ] `backend: npx tsc --noEmit` sin errores.
- [ ] `frontend: npm run build` compila sin errores de tipos.
- [ ] Todos los endpoints nuevos requieren autenticación (401 sin sesión).
