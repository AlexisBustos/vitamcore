# Backlog técnico recomendado — Sprint 3

Con la base ejecutiva completa (estructura + ventas + finanzas + documentos + decisiones),
el Sprint 3 se centra en la **IA Ejecutiva** y en cerrar la deuda técnica acumulada.

## 1. IA Ejecutiva (módulo principal del Sprint 3)

- **Integración con un LLM (Claude)** vía el backend (nunca exponer la API key al cliente).
- **Recomendación ejecutiva del día**: generar un resumen accionable a partir de datos reales
  (proyectos bloqueados, tareas vencidas/críticas, oportunidades sin seguimiento, gastos vencidos,
  resultado del mes, decisiones por revisar).
- **Resumen automático de documentos** (`aiSummary`): al subir un documento, extraer texto y
  generar el resumen con IA.
- **Búsqueda semántica** con `pgvector`: habilitar la extensión en PostgreSQL, generar embeddings
  de proyectos, tareas, documentos y decisiones, y permitir consultas en lenguaje natural.
- **Asistente conversacional ejecutivo** que responda sobre el estado de ambas empresas.

## 2. Almacenamiento real de documentos

- Implementar carga de archivos a S3 / Cloudflare R2 con URLs prefirmadas.
- Ver `docs/STORAGE.md` para el detalle de pasos pendientes.

## 3. Deuda técnica detectada (priorizada)

- **Montos como `Int` (CLP)**: hoy los importes son enteros sin decimales y limitados a ~2.147 × 10⁹.
  Si se requiere multimoneda con decimales o importes mayores, migrar a `BigInt`/`Decimal` y ajustar
  serialización en API y formato en frontend.
- **Conversión de moneda**: el campo `currency` existe pero los totales del dashboard/finanzas asumen
  una sola moneda (CLP). Falta consolidación multimoneda si se usan otras divisas.
- **Validación unidad↔proyecto**: se valida que unidad y proyecto pertenezcan a la empresa, pero no que
  la unidad coincida con la del proyecto cuando ambos se asignan (arrastrado del Sprint 1).
- **Paginación y búsqueda**: las listas de ventas, ingresos, gastos, documentos y decisiones traen todo.
  Añadir paginación y búsqueda por texto al crecer el volumen.
- **Optimización del dashboard**: el endpoint hace muchas consultas (finanzas + ventas + proyectos +
  tareas). Está bien para el volumen actual; considerar caché o consultas combinadas a futuro.
- **Confirmaciones de borrado**: reemplazar `window.confirm` por un modal de confirmación propio.
- **Detalle dedicado de oportunidades**: hoy se editan en modal; valorar una página de detalle con
  histórico de seguimiento.

## 4. Endurecimiento y operación (arrastrado de sprints previos)

- `helmet` + rate limiting en `/auth/login`.
- Refresh tokens / renovación de sesión.
- Tests automatizados: unitarios de servicios e integración de endpoints (Vitest + Supertest).
- Logging estructurado (pino) y CI (lint + typecheck + build).
- Roles y permisos cuando se sumen más usuarios.
