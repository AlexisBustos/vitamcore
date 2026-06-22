# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

El proyecto está íntegramente en español: comentarios, mensajes de error de la API, nombres de rutas del frontend (`/empresas`, `/proyectos`, `/ia`…) y documentación. Escribe código y mensajes nuevos en español, manteniendo los identificadores técnicos del dominio (enums de Prisma, tipos) en inglés como ya están.

## Qué es

Plataforma interna privada de dirección ejecutiva (un solo usuario, el CEO) para gestionar **Vitam Healthcare** y **Vitam Tech**. No es un SaaS multiusuario. Monorepo con dos paquetes independientes (`backend/`, `frontend/`), sin workspace raíz: cada uno tiene su propio `package.json` y se instala/ejecuta por separado.

## Comandos

Base de datos (desde la raíz):
```bash
docker compose up -d        # PostgreSQL 16 con BD vitamcore ya creada (puerto 5432)
docker compose down -v      # detener y borrar datos
```

Backend (`cd backend`):
```bash
npm run dev                 # tsx watch → API en http://localhost:4000
npm run build               # tsc → dist/
npm start                   # ejecuta dist/index.js
npm run prisma:migrate      # prisma migrate dev --name init (crea/aplica migración)
npm run prisma:seed         # crea usuario CEO + AppConfig (tsx prisma/seed.ts)
npm run prisma:generate     # regenera el cliente Prisma tras editar schema.prisma
npm run prisma:studio       # explorador visual de la BD
```

Frontend (`cd frontend`):
```bash
npm run dev                 # Vite → http://localhost:5173 (proxy /api → :4000)
npm run build               # tsc --noEmit && vite build
npm run lint                # tsc --noEmit (no hay ESLint; el typecheck ES el lint)
```

No hay framework de tests configurado en ningún paquete. La verificación es el typecheck (`npm run lint` en frontend, `npm run build` en backend).

Credenciales del seed: `ceo@vitam.tech` / `VitamCore2026!` (definidas en `backend/.env`).

## Arquitectura backend (Express + Prisma)

Estructura modular por dominio en `src/modules/<dominio>/`. Cada dominio repite el mismo patrón de 4 archivos —es la convención clave a seguir al añadir o modificar endpoints:

- `*.routes.ts` — define rutas Express, envuelve cada controller en `asyncHandler` (de `utils/async-handler.ts`, captura errores async y los pasa al middleware central).
- `*.controller.ts` — parsea `req.body`/`req.query` con el schema Zod (`.parse()`, no try/catch) y delega al service. Responde siempre con `{ data: ... }` o `{ ok: true }`.
- `*.service.ts` — toda la lógica de negocio y acceso a Prisma. Lanza errores vía helpers de `utils/http-error.ts` (`notFound`, `badRequest`, `unauthorized`). Traduce `P2002` de Prisma a `badRequest`.
- `*.schema.ts` — schemas Zod de entrada (create/update/listQuery). Reutiliza helpers comunes de `modules/shared/zod.ts` (`dateInput`, `optionalText`, `amount`, `currency`…).

Flujo de una request: `routes/index.ts` monta todos los módulos bajo `/api` y aplica `requireAuth` a todos salvo `/health` y `/auth`. → `asyncHandler(controller)` → controller valida con Zod → service → Prisma.

Convenciones transversales:
- **Validación de coherencia relacional**: antes de escribir, los services llaman a `modules/shared/relations.ts` (`assertOrganization`, `assertBusinessUnitInOrganization`, `assertContext`) para garantizar que la jerarquía empresa → unidad → proyecto sea consistente y que nada quede asociado a otra empresa.
- **Errores**: `middleware/error.ts` es el único punto que serializa errores. `ZodError` → 400 con `details`; `HttpError` → su `statusCode`; cualquier otro → 500 genérico sin filtrar internos. Nunca devuelvas stack traces.
- **Config**: `config/env.ts` valida todas las variables de entorno con Zod al arrancar (fail-fast con `process.exit(1)`). Importa siempre `env` desde ahí, no `process.env`.
- **Auth**: JWT en cookie `httpOnly` (no header `Authorization`). `requireAuth` lee la cookie, verifica el token y adjunta `req.user`. El frontend manda `credentials: 'include'`.
- **Prisma**: cliente singleton en `lib/prisma.ts`. Tras cambiar `schema.prisma`, corre `prisma:migrate` y `prisma:generate`.

### Agent Layer (`modules/agent/`)

Capa de IA ejecutiva con detalle propio en `docs/AGENT.md`. Puntos críticos:
- La **API key del proveedor IA vive solo en el backend** (`AGENT_API_KEY`) y nunca se expone al frontend.
- Dos providers intercambiables tras la interfaz `AgentProvider` (`providers/types.ts`): `AnthropicProvider` (Claude, `@anthropic-ai/sdk`, modelo `claude-opus-4-8` por defecto, loop de tool-use real) y `HeuristicProvider` (determinístico, **sin API key, es el modo por defecto**). Si `AGENT_PROVIDER=anthropic` pero falta la key, cae automáticamente a heurístico.
- El `orchestrator.ts` construye contexto, ejecuta el provider y persiste conversaciones/mensajes. Las **internal tools** (`tools.ts`) son funciones read sobre datos reales y un conjunto acotado de write tools (`createAIInsight`, `proposeTask`, `createExecutiveReport`) que solo se exponen al modelo si `AGENT_ALLOW_WRITE_ACTIONS=true`. **No existe ninguna tool destructiva** (borrar, modificar finanzas/ventas, cerrar oportunidades). Las tareas propuestas quedan en estado `PROPOSED` hasta aprobación manual.

## Arquitectura frontend (React + Vite + TanStack Query)

- **Datos**: nunca se llama a `fetch` directo desde componentes. Todo pasa por `lib/api.ts` (cliente único con `credentials: 'include'` y clase `ApiError`) y se consume vía hooks de React Query en `hooks/use<Dominio>.ts`. Cada hook expone queries (`useX`, `useXDetail`) y mutaciones (`useSaveX`, `useDeleteX`) que **invalidan el grafo de query keys relacionado** en `onSuccess` (p. ej. guardar un proyecto invalida `projects`, `organizations`, `tasks`, `dashboard`). Respeta este patrón de invalidación al añadir mutaciones.
- **Filtros → query string**: usa el helper `toQuery()` de `lib/api.ts` (omite valores vacíos) para construir las URLs con filtros.
- **Rutas**: `App.tsx` define todo. `ProtectedRoute` envuelve las rutas privadas dentro de `AppLayout`; `/login` es pública. Las rutas están en español.
- **UI**: componentes estilo shadcn/ui en `components/ui/` + Tailwind CSS v4 (plugin `@tailwindcss/vite`, sin `tailwind.config`). Alias de import `@/` → `frontend/src/` (configurado en `vite.config.ts` y `tsconfig.json`).
- **Tipos**: `types/domain.ts` y `types/agent.ts` reflejan las respuestas del backend; mantenlos sincronizados con los enums/modelos de Prisma.

## Modelo de datos

Definido en `backend/prisma/schema.prisma` (PostgreSQL). Jerarquía central: `Organization` → `BusinessUnit` → `Project` → `Task`, con módulos ejecutivos (`Sale`, `Income`, `Expense`, `Document`, `Decision`) que cuelgan de la empresa y opcionalmente de unidad/proyecto. La capa de agente añade `AIConversation`, `AIMessage`, `AIInsight`, `ProposedTask`, `ExecutiveReport`. Las migraciones están versionadas por sprint en `prisma/migrations/`.

## Documentación de referencia

`docs/` contiene el detalle por sprint: `AGENT.md` (arquitectura IA + system prompt de 6 secciones), `STORAGE.md` (qué falta para almacenamiento real de documentos S3/R2), backlogs y checklists de cada sprint. El `README.md` tiene la tabla completa de endpoints y filtros por query string.
