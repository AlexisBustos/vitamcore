# Checklist de validación — Sprint 3 (Agent Layer)

## Datos y arranque

- [ ] `npm run prisma:migrate` aplica la migración `sprint3_agent_layer`.
- [ ] Backend levanta; `GET /api/agent/status` devuelve `enabled`, `provider`, `model`.
- [ ] Modo por defecto: `provider=heuristic` (funciona sin API key).

## Agente

- [ ] Puedo abrir la sección **IA Ejecutiva** y ver el agente activo.
- [ ] Puedo hacer preguntas y el agente responde con datos reales.
- [ ] El agente distingue Vitam Healthcare de Vitam Tech.
- [ ] Acción rápida "Resumen consolidado" genera el resumen de ambas empresas.
- [ ] Acciones "Resumen Healthcare" / "Resumen Tech" generan resúmenes por empresa.
- [ ] El agente analiza ventas, finanzas, proyectos, tareas y decisiones.
- [ ] Cada respuesta separa hechos, riesgos, recomendaciones y próximas acciones.
- [ ] Cada respuesta muestra las herramientas internas usadas (trazabilidad).
- [ ] El agente indica cuándo falta información.

## Insights

- [ ] Puedo guardar un insight desde el asistente.
- [ ] El panel de insights lista los insights con filtros (empresa, agente, estado, prioridad).
- [ ] Puedo marcar un insight como revisado / accionado / descartado.

## Tareas propuestas

- [ ] El agente propone tareas en estado `PROPOSED` (no se crean como tareas reales).
- [ ] Puedo aprobar, rechazar o convertir una tarea propuesta.
- [ ] Al convertir, se crea una tarea real (source `AI`) y la propuesta queda `CONVERTED_TO_TASK`.

## Reportes

- [ ] Puedo generar un reporte ejecutivo (consolidado o por empresa).
- [ ] El reporte se guarda y puedo ver su contenido y reportes anteriores.

## Seguridad

- [ ] Todos los endpoints `/api/agent/*` devuelven 401 sin sesión.
- [ ] La API key del proveedor NO aparece en ninguna respuesta ni en el frontend.
- [ ] No existe ninguna acción que borre o modifique finanzas/ventas/decisiones.
- [ ] `AGENT_ENABLED=false` desactiva el agente (responde con error controlado).

## Calidad técnica

- [ ] `backend: npx tsc --noEmit` sin errores.
- [ ] `frontend: npm run build` compila sin errores de tipos.
- [ ] El sistema registra conversaciones, mensajes, insights, reportes y herramientas usadas.
