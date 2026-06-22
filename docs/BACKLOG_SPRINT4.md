# Backlog técnico recomendado — Sprint 4

Con el Agent Layer en marcha (heurístico + Claude), el Sprint 4 profundiza la IA,
habilita almacenamiento real y cierra deuda técnica.

## 1. IA avanzada y RAG

- **Almacenamiento real de documentos** (S3 / Cloudflare R2) — ver `docs/STORAGE.md`.
- **Lectura documental + RAG**: extraer texto de los archivos, generar `aiSummary` automáticamente,
  habilitar `pgvector` y embeddings de proyectos, tareas, documentos y decisiones para búsqueda
  semántica y un `Document Agent` con contexto real.
- **Agentes especializados independientes**: separar `Finance`, `Sales`, `Project`, `Strategy` y
  `Document` en providers/orquestadores propios reutilizando las Internal Tools.
- **Streaming de respuestas** del agente (SSE) para mejorar la UX en respuestas largas con Claude.
- **Insights automáticos programados**: job que ejecuta análisis periódicos y crea insights `NEW`
  (alertas de gastos vencidos, oportunidades sin seguimiento, proyectos bloqueados).

## 2. Mejoras al Agent Layer

- **Continuidad de conversación en el frontend**: cargar y retomar conversaciones anteriores
  (hoy el historial se persiste pero la UI inicia limpio en cada acción rápida).
- **Mejor parseo de secciones** para `highlights/risks/recommendations/nextActions` de los reportes.
- **Vínculo insight → tarea propuesta**: usar `sourceInsightId` desde la UI al proponer una tarea
  a partir de un insight.
- **Límites de uso / rate limiting** del agente y registro de tokens cuando se usa Claude.
- **Referencias clicables**: enlazar las entidades mencionadas por el agente a sus pantallas.

## 3. Deuda técnica (arrastrada y nueva)

- **Agent Layer desacoplado**: `organizationId/projectId` en conversaciones, insights y reportes son
  strings sin FK. Si se requiere integridad referencial estricta, agregar relaciones con `SetNull`.
- **Montos `Int` (CLP)** sin decimales ni multimoneda (Sprint 2).
- **Validación unidad↔proyecto** parcial en tareas (Sprint 1).
- **Paginación y búsqueda por texto** en todas las listas.
- **Confirmaciones de borrado** con modal propio en lugar de `window.confirm`.

## 4. Endurecimiento y operación (pendiente desde Sprint 0–1)

- `helmet` + rate limiting en `/auth/login` y en `/agent/*`.
- Refresh tokens / renovación de sesión.
- Tests automatizados: unitarios de servicios y del orquestador, integración de endpoints
  (incluido el modo heurístico del agente, que es determinístico y fácil de testear).
- Logging estructurado (pino) y CI (lint + typecheck + build).
- Roles y permisos cuando se sumen usuarios; control de quién puede usar el agente.
