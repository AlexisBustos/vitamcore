# Agent Layer de VITAM CORE

Capa de agentes internos controlados que consultan datos reales de VITAM CORE,
generan análisis, insights y reportes, y proponen tareas sin ejecutarlas.

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend  ·  IA Ejecutiva (Asistente / Insights / Tareas /    │
│              Reportes)  —  nunca recibe la API key            │
└───────────────────────────┬──────────────────────────────────┘
                            │  /api/agent/*  (autenticado)
┌───────────────────────────▼──────────────────────────────────┐
│ Agent Orchestrator (modules/agent/orchestrator.ts)            │
│  recibe mensaje → construye contexto/historial → ejecuta el   │
│  proveedor → valida → persiste conversación/mensajes/tools    │
└───────┬───────────────────────────────┬──────────────────────┘
        │                               │
┌───────▼────────────┐        ┌─────────▼───────────────────────┐
│ Provider abstraction│        │ Internal Tools (modules/agent/  │
│ - AnthropicProvider │◄──────►│ tools.ts): getOrganizations,    │
│   (Claude, tool-use)│  usa   │ getProjects, getTasks, getSales,│
│ - HeuristicProvider │        │ getFinancialSummary, ...,       │
│   (sin API key)     │        │ + write: createAIInsight,       │
└─────────────────────┘        │   proposeTask, createReport     │
                               └─────────────┬───────────────────┘
                                             │  Prisma
                               ┌─────────────▼───────────────────┐
                               │ PostgreSQL (datos reales VITAM)  │
                               └──────────────────────────────────┘
```

### Componentes

- **Internal Tools** (`tools.ts`): funciones que consultan datos reales (read) y registran
  resultados controlados (write). Las write tools (`createAIInsight`, `proposeTask`,
  `createExecutiveReport`) **no** ejecutan acciones operativas y solo se exponen al modelo si
  `AGENT_ALLOW_WRITE_ACTIONS=true`. **No existe** ninguna tool para borrar, modificar finanzas/ventas,
  cerrar oportunidades o marcar decisiones como implementadas.
- **Provider abstraction** (`providers/`): interfaz `AgentProvider` con dos implementaciones.
  - `AnthropicProvider`: usa el SDK de Anthropic con un loop de tool-use real (`claude-opus-4-8`
    por defecto). La API key vive solo en el backend.
  - `HeuristicProvider`: motor determinístico que llama a las tools y construye respuestas
    ejecutivas reales con el formato de 6 secciones. **No requiere API key** y es el modo por defecto.
- **Orchestrator** (`orchestrator.ts`): coordina chat y acciones rápidas, persiste conversaciones,
  mensajes (con `metadata.toolsUsed` para trazabilidad), y expone el estado del agente.

## Agentes especializados

La arquitectura está preparada para agentes por dominio (`AgentType`): `EXECUTIVE`, `FINANCE`,
`SALES`, `PROJECT`, `DOCUMENT`, `STRATEGY`, `GENERAL`. En esta versión, un único orquestador con
foco por dominio (`AGENT_FOCUS` en `prompt.ts`) cubre todos; separar en agentes independientes es
agregar nuevos providers/orquestadores reutilizando las mismas tools.

## Configurar el proveedor IA

En `backend/.env`:

```bash
# Modo heurístico (por defecto, sin API key):
AGENT_PROVIDER=heuristic
AGENT_ENABLED=true

# Modo Claude (IA real):
AGENT_PROVIDER=anthropic
AGENT_API_KEY=sk-ant-...          # obtén una en https://console.anthropic.com
AGENT_MODEL=claude-opus-4-8
AGENT_ALLOW_WRITE_ACTIONS=false   # true permite que el agente cree insights/tareas propuestas
```

> El frontend nunca recibe la clave. Si `AGENT_PROVIDER=anthropic` pero `AGENT_API_KEY` está vacío,
> el sistema cae automáticamente al modo heurístico. `AGENT_ENABLED=false` desactiva el agente.

## System prompt

El system prompt base (`prompt.ts`) instruye al agente a: responder solo con datos disponibles,
no inventar, separar hechos/riesgos/recomendaciones/próximos pasos, indicar información faltante,
distinguir Vitam Healthcare de Vitam Tech, mantener trazabilidad y proponer tareas solo como
sugerencias. Formato de respuesta de 6 secciones:

1. Resumen ejecutivo
2. Hechos observados
3. Riesgos o alertas
4. Recomendaciones
5. Próximas acciones sugeridas
6. Información faltante o incertidumbres

## Seguridad

- Todos los endpoints `/api/agent/*` requieren autenticación.
- No hay acciones destructivas ni escritura directa sobre finanzas, ventas o decisiones.
- Las tareas propuestas quedan en estado `PROPOSED` hasta que el usuario las apruebe o convierta.
- Cada respuesta registra el proveedor y las herramientas usadas (`metadata.toolsUsed`).
- El contexto enviado al modelo se limita con `AGENT_MAX_CONTEXT_ITEMS`.
- El agente se puede desactivar por completo con `AGENT_ENABLED=false`.
