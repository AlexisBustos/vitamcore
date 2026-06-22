# Backlog técnico recomendado — Sprint 2

La base estructural (empresas, unidades, proyectos, tareas) ya está lista. El Sprint 2
incorpora los módulos transaccionales y de conocimiento.

## 1. Ventas (pipeline comercial)

- Modelo `SaleOpportunity`: empresa, unidad, contacto/cliente, monto, moneda, etapa
  (`LEAD`, `QUALIFIED`, `PROPOSAL`, `NEGOTIATION`, `WON`, `LOST`), probabilidad, fecha estimada de cierre.
- CRUD + filtros por empresa y etapa.
- Vista kanban por etapa + tarjeta de "Ventas abiertas" en el dashboard.

## 2. Finanzas (ingresos y gastos)

- Modelos `IncomeEntry` y `ExpenseEntry`: empresa, unidad/proyecto, categoría, monto, fecha, recurrencia.
- Agregaciones por mes y por empresa; cálculo de resultado estimado.
- Conectar las tarjetas financieras del dashboard (ingresos/gastos/resultado) a datos reales.
- Considerar enlazar ventas ganadas como ingreso proyectado.

## 3. Documentos

- Integración con almacenamiento S3 / Cloudflare R2 (subida vía URLs prefirmadas).
- Modelo `Document`: empresa, proyecto, tipo, metadatos, URL/clave de objeto.
- Asociar documentos a empresas, proyectos y decisiones.

## 4. Decisiones

- Modelo `Decision`: título, contexto, decisión tomada, estado, fecha, responsables, enlaces a proyectos.
- Bitácora cronológica y tarjeta de "Decisiones pendientes" en el dashboard.

## 5. IA Ejecutiva

- Integración con un LLM (Claude) para resúmenes y recomendaciones ejecutivas.
- Habilitar `pgvector` para búsqueda semántica sobre proyectos, tareas, documentos y decisiones.
- "Recomendación ejecutiva del día" basada en datos reales (riesgos, vencimientos, bloqueos).

## 6. Mejoras a lo ya construido (deuda técnica priorizada)

- **Validación de subconjunto unidad↔proyecto en tareas**: hoy se valida que la unidad y el
  proyecto pertenezcan a la empresa de la tarea; añadir que, si la tarea tiene proyecto y unidad,
  la unidad coincida con la del proyecto.
- **Paginación y búsqueda por texto** en proyectos y tareas (hoy se listan todos).
- **Optimización del dashboard**: `projectsByOrganization` hace varias consultas en serie;
  reemplazar por un único `groupBy` por empresa+estado cuando crezca el volumen.
- **Confirmaciones de borrado** con un modal propio en lugar de `window.confirm`.
- **Ordenamiento configurable** de las tablas (por fecha, prioridad, estado).
- **Optimistic updates** en cambios rápidos de estado de tareas.

## 7. Endurecimiento y operación (arrastrado desde Sprint 1)

- `helmet` + rate limiting en `/auth/login`.
- Refresh tokens / renovación de sesión.
- Tests automatizados: unitarios de servicios e integración de endpoints (Vitest + Supertest).
- Logging estructurado (pino) y CI (lint + typecheck + build).
- Roles y permisos cuando se sumen más usuarios.
