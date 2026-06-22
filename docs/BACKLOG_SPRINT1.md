# Backlog técnico recomendado — Sprint 1

Prioridad sugerida de mayor a menor. La base del Sprint 0 ya deja el camino preparado.

## 1. Modelo de dominio (empresas y unidades)

- Agregar al `schema.prisma`:
  - `Company` (Vitam Healthcare, Vitam Tech): `id`, `name`, `slug`, `type`, `isActive`.
  - `BusinessUnit` (centro médico, software, IA, etc.) con relación a `Company`.
  - Relación `User`–`Company` si más adelante hay accesos por empresa.
- Seed de las 2 empresas y sus unidades iniciales.
- Endpoints CRUD de empresas y unidades.
- Pantalla **Empresas** funcional (reemplaza el placeholder).

## 2. Proyectos y tareas

- Modelos `Project` y `Task` con relación a `Company` / `BusinessUnit`.
- Estados (`activo`, `pausado`, `cerrado`) y prioridades.
- CRUD + listados filtrables por empresa.
- Conectar las tarjetas "Proyectos activos" y "Tareas pendientes" a datos reales.

## 3. Finanzas, ingresos, gastos y ventas

- Modelos `IncomeEntry`, `ExpenseEntry`, `SaleOpportunity`.
- Agregaciones por mes y por empresa.
- Reemplazar los datos mock del dashboard por consultas reales (endpoint `/dashboard/summary?company=`).

## 4. Decisiones

- Modelo `Decision` (título, contexto, decisión, estado, fecha).
- Registro y bitácora de decisiones ejecutivas.

## 5. Documentos

- Integración con almacenamiento S3 / Cloudflare R2.
- Modelo `Document` con metadatos + subida mediante URLs prefirmadas.

## 6. IA Ejecutiva

- Integración con un LLM (Claude) para resúmenes y recomendaciones.
- Habilitar `pgvector` en PostgreSQL para búsqueda semántica sobre documentos y decisiones.
- Endpoint de "recomendación ejecutiva del día" basado en datos reales.

## 7. Endurecimiento y operación

- **Refresh tokens** y expiración/renovación de sesión.
- **Rate limiting** en `/auth/login` (p. ej. `express-rate-limit`) y cabeceras de seguridad (`helmet`).
- **Migraciones de producción** (`prisma migrate deploy`) y estrategia de despliegue.
- **Tests**: unitarios de servicios (auth) e integración de endpoints (Jest/Vitest + Supertest).
- **Logging estructurado** (pino) y manejo de errores observables.
- **CI**: lint + typecheck + build en cada push.
- Roles más granulares cuando se sumen usuarios (hoy basta CEO/ADMIN).
