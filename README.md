# VITAM CORE

Plataforma interna privada de dirección ejecutiva para centralizar la gestión de **Vitam Healthcare** y **Vitam Tech**: proyectos, ventas, finanzas, gastos, ingresos, documentos, decisiones, tareas e información estratégica, con visión consolidada y visión separada por empresa.

> Uso privado / individual (CEO). No es un SaaS. Esta es la base técnica del **Sprint 0**.

---

## Stack

| Capa            | Tecnología                                              |
| --------------- | ------------------------------------------------------- |
| Frontend        | React + TypeScript + Vite                               |
| UI              | Tailwind CSS v4 + componentes estilo shadcn/ui          |
| Backend         | Node.js + TypeScript + **Express**                      |
| Base de datos   | PostgreSQL                                              |
| ORM             | Prisma                                                  |
| Autenticación   | Email + contraseña, JWT en cookie `httpOnly`            |
| Validación      | Zod (entrada de API y variables de entorno)             |
| Estado/datos UI | TanStack React Query (cache, mutaciones, invalidación)  |

### ¿Por qué Express y no NestJS?

Para un alcance inicial de **un solo usuario** que prioriza **velocidad y claridad**, Express con una
estructura modular por dominios (`controller` / `service` / `routes` / `schema`) entrega lo necesario sin
la curva de NestJS. La organización en `src/modules/*` deja el camino abierto a migrar a NestJS si el
producto crece en equipo y complejidad.

---

## Estructura del proyecto

```
vitamcore/
├── backend/                  # API Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma     # Modelo de datos (User, AppConfig)
│   │   └── seed.ts           # Usuario CEO + configuración mínima
│   └── src/
│       ├── config/env.ts     # Validación de variables de entorno con Zod
│       ├── lib/prisma.ts     # Cliente Prisma singleton
│       ├── middleware/        # auth + manejo de errores
│       ├── modules/auth/      # login / logout / me
│       ├── utils/             # password (bcrypt) + jwt
│       ├── app.ts             # Configuración de la app Express
│       └── index.ts           # Arranque del servidor
├── frontend/                 # SPA React + Vite
│   └── src/
│       ├── components/        # layout + ui reutilizable
│       ├── context/           # AuthContext (sesión)
│       ├── lib/               # cliente HTTP centralizado
│       ├── pages/             # login, dashboard y placeholders
│       └── routes/            # rutas protegidas
├── docs/                     # checklist Sprint 0 + backlog Sprint 1
└── README.md
```

---

## Requisitos previos

- Node.js 20+
- PostgreSQL 14+ corriendo localmente (o accesible por URL)

---

## Puesta en marcha (desarrollo local)

### 1. Base de datos

Opción recomendada — **PostgreSQL en Docker** (incluido en el repo):

```bash
docker compose up -d        # levanta postgres:16 con la BD vitamcore ya creada
```

> Detener: `docker compose down` · Borrar también los datos: `docker compose down -v`

Si prefieres un PostgreSQL propio, crea una base de datos vacía:

```sql
CREATE DATABASE vitamcore;
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # En Windows PowerShell: copy .env.example .env
# Edita .env y ajusta DATABASE_URL y JWT_SECRET

npm install
npm run prisma:migrate        # crea las tablas (migración inicial)
npm run prisma:seed           # crea el usuario CEO y la config mínima
npm run dev                   # API en http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env          # opcional; valores por defecto ya funcionan
npm install
npm run dev                   # App en http://localhost:5173
```

### 4. Iniciar sesión

Abre `http://localhost:5173` y entra con las credenciales del seed:

- **Email:** `ceo@vitam.tech`
- **Contraseña:** `VitamCore2026!`

> Cambia estas credenciales en `backend/.env` antes de cualquier uso real.

---

## Scripts útiles

### Backend (`/backend`)

| Comando                  | Descripción                                      |
| ------------------------ | ------------------------------------------------ |
| `npm run dev`            | Servidor en modo desarrollo (recarga con tsx)    |
| `npm run build`          | Compila a `dist/`                                |
| `npm start`             | Ejecuta la build de producción                   |
| `npm run prisma:migrate` | Crea/aplica la migración inicial (`dev`)         |
| `npm run prisma:seed`    | Carga datos iniciales                            |
| `npm run prisma:studio`  | Explorador visual de la base de datos            |
| `npm run prisma:generate`| Regenera el cliente Prisma                       |

### Frontend (`/frontend`)

| Comando           | Descripción                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Servidor de desarrollo Vite          |
| `npm run build`   | Build de producción                  |
| `npm run preview` | Previsualiza la build                |

---

## Endpoints del backend

| Método | Ruta                       | Descripción                              | Auth |
| ------ | -------------------------- | ---------------------------------------- | ---- |
| GET    | `/api/health`              | Health check                             | No   |
| POST   | `/api/auth/login`          | Inicia sesión, setea cookie JWT          | No   |
| POST   | `/api/auth/logout`         | Cierra sesión, limpia la cookie          | No   |
| GET    | `/api/auth/me`             | Devuelve el usuario de la sesión         | Sí   |
| GET    | `/api/organizations`       | Lista empresas (con counts)              | Sí   |
| POST   | `/api/organizations`       | Crea empresa                             | Sí   |
| GET    | `/api/organizations/:id`   | Detalle (unidades + proyectos)           | Sí   |
| PATCH  | `/api/organizations/:id`   | Actualiza empresa                        | Sí   |
| DELETE | `/api/organizations/:id`   | Elimina empresa (cascada)                | Sí   |
| GET    | `/api/business-units`      | Lista unidades (`?organizationId`)       | Sí   |
| POST   | `/api/business-units`      | Crea unidad                              | Sí   |
| PATCH  | `/api/business-units/:id`  | Actualiza / activa / desactiva           | Sí   |
| DELETE | `/api/business-units/:id`  | Elimina unidad                           | Sí   |
| GET    | `/api/projects`            | Lista proyectos (filtros varios)         | Sí   |
| POST   | `/api/projects`            | Crea proyecto                            | Sí   |
| GET    | `/api/projects/:id`        | Detalle (con tareas)                     | Sí   |
| PATCH  | `/api/projects/:id`        | Actualiza proyecto                       | Sí   |
| DELETE | `/api/projects/:id`        | Elimina proyecto                         | Sí   |
| GET    | `/api/tasks`               | Lista tareas (filtros, `?overdue=true`)  | Sí   |
| POST   | `/api/tasks`               | Crea tarea                               | Sí   |
| PATCH  | `/api/tasks/:id`           | Actualiza / cambia estado                | Sí   |
| DELETE | `/api/tasks/:id`           | Elimina tarea                            | Sí   |
| GET    | `/api/sales`               | Lista oportunidades (filtros varios)     | Sí   |
| GET    | `/api/sales/summary`       | KPIs del pipeline (`?organizationId`)    | Sí   |
| POST/PATCH/DELETE | `/api/sales[/:id]` | CRUD de oportunidades                    | Sí   |
| GET/POST/PATCH/DELETE | `/api/income[/:id]` | CRUD de ingresos                     | Sí   |
| GET/POST/PATCH/DELETE | `/api/expenses[/:id]` | CRUD de gastos                     | Sí   |
| GET    | `/api/finance/summary`     | Resumen financiero (`?organizationId`)   | Sí   |
| GET/POST/PATCH/DELETE | `/api/documents[/:id]` | CRUD de documentos                 | Sí   |
| GET/POST/PATCH/DELETE | `/api/decisions[/:id]` | CRUD de decisiones estratégicas    | Sí   |
| POST   | `/api/agent/chat`          | Envía un mensaje al agente ejecutivo     | Sí   |
| GET    | `/api/agent/status`        | Estado del agente (proveedor, modelo)    | Sí   |
| GET    | `/api/agent/conversations` | Lista/obtiene conversaciones (`/:id`)    | Sí   |
| POST   | `/api/agent/quick-actions/*` | 7 acciones rápidas (resúmenes, análisis) | Sí   |
| GET/POST | `/api/agent/insights`    | Lista/crea insights; `PATCH /:id/status` | Sí   |
| GET/POST | `/api/agent/proposed-tasks` | Tareas propuestas; `/:id/approve\|reject\|convert` | Sí |
| GET/POST | `/api/agent/reports`     | Lista/genera reportes ejecutivos         | Sí   |
| GET    | `/api/dashboard/summary`   | Métricas (`?organizationId` opcional)    | Sí   |

> **Agent Layer (IA Ejecutiva):** la clave del proveedor IA vive **solo en el backend**
> (`AGENT_API_KEY`) y nunca se expone al frontend. Por defecto el agente opera en modo
> **heurístico** (analiza datos reales sin necesitar API key). Ver [`docs/AGENT.md`](docs/AGENT.md).

Filtros disponibles por query string:
- **projects**: `organizationId`, `businessUnitId`, `status`, `priority`
- **tasks**: `organizationId`, `businessUnitId`, `projectId`, `status`, `priority`, `overdue`
- **sales**: `organizationId`, `businessUnitId`, `projectId`, `status`, `productOrService`, `minProbability`, `noFollowUp`
- **income / expenses**: `organizationId`, `businessUnitId`, `projectId`, `category`, `status`, `isRecurring`
- **documents**: `organizationId`, `businessUnitId`, `projectId`, `documentType`, `status`, `clientName`
- **decisions**: `organizationId`, `businessUnitId`, `projectId`, `status`

---

## Documentación adicional

- [`docs/SPRINT0_CHECKLIST.md`](docs/SPRINT0_CHECKLIST.md) — checklist de validación del Sprint 0.
- [`docs/BACKLOG_SPRINT1.md`](docs/BACKLOG_SPRINT1.md) — backlog técnico del Sprint 1 (entregado).
- [`docs/SPRINT1_CHECKLIST.md`](docs/SPRINT1_CHECKLIST.md) — checklist de validación del Sprint 1.
- [`docs/BACKLOG_SPRINT2.md`](docs/BACKLOG_SPRINT2.md) — backlog técnico del Sprint 2 (entregado).
- [`docs/SPRINT2_CHECKLIST.md`](docs/SPRINT2_CHECKLIST.md) — checklist de validación del Sprint 2.
- [`docs/BACKLOG_SPRINT3.md`](docs/BACKLOG_SPRINT3.md) — backlog técnico del Sprint 3 (entregado).
- [`docs/AGENT.md`](docs/AGENT.md) — arquitectura del Agent Layer, system prompt y configuración del proveedor IA.
- [`docs/SPRINT3_CHECKLIST.md`](docs/SPRINT3_CHECKLIST.md) — checklist de validación del Sprint 3.
- [`docs/BACKLOG_SPRINT4.md`](docs/BACKLOG_SPRINT4.md) — backlog técnico recomendado para el Sprint 4.
- [`docs/STORAGE.md`](docs/STORAGE.md) — qué falta para habilitar almacenamiento real de documentos (S3/R2).
