# Checklist de validación — Sprint 1

Módulos estructurales: Empresas, Unidades de Negocio, Proyectos y Tareas.

## Datos y arranque

- [ ] `docker compose up -d` (o PostgreSQL propio) disponible.
- [ ] `npm run prisma:migrate` aplica la migración `sprint1_structural_modules`.
- [ ] `npm run prisma:seed` carga: 2 empresas, 11 unidades, 11 proyectos, 9 tareas.
- [ ] Backend (`npm run dev`) y frontend (`npm run dev`) levantan sin errores.

## Empresas

- [ ] La página Empresas lista Vitam Healthcare y Vitam Tech con sus counts.
- [ ] Puedo crear una empresa nueva (nombre, tipo, estado, descripción).
- [ ] Puedo editar una empresa.
- [ ] El detalle de empresa muestra unidades y proyectos asociados.
- [ ] Crear empresa con nombre duplicado devuelve un error claro.

## Unidades de negocio

- [ ] Desde el detalle de empresa puedo crear una unidad.
- [ ] Puedo editar una unidad.
- [ ] Puedo activar/desactivar una unidad (botón de encendido).
- [ ] Puedo eliminar una unidad (con confirmación).
- [ ] El listado de unidades se puede filtrar por empresa (endpoint `?organizationId`).

## Proyectos

- [ ] La página Proyectos lista todos los proyectos en una tabla.
- [ ] Puedo crear un proyecto asociado a una empresa y (opcional) unidad.
- [ ] El selector de unidad solo muestra unidades de la empresa elegida.
- [ ] Puedo editar un proyecto y cambiar su estado y prioridad.
- [ ] Filtros funcionan: empresa, unidad, estado, prioridad.
- [ ] El detalle de proyecto muestra próxima acción, riesgos y tareas asociadas.
- [ ] La fecha objetivo vencida se resalta en rojo.
- [ ] No puedo asociar a un proyecto una unidad de otra empresa (error 400).

## Tareas

- [ ] La página Tareas lista todas las tareas en una tabla.
- [ ] Puedo crear una tarea asociada a empresa, unidad y proyecto.
- [ ] El selector de proyecto solo muestra proyectos de la empresa elegida.
- [ ] Puedo editar una tarea.
- [ ] Acciones rápidas: marcar completada y marcar bloqueada.
- [ ] Filtros funcionan: empresa, proyecto, estado, prioridad, solo vencidas.
- [ ] Las tareas vencidas se resaltan en rojo.
- [ ] No puedo asociar una tarea a un proyecto de otra empresa (error 400).

## Dashboard

- [ ] Muestra métricas reales: proyectos activos, bloqueados, tareas pendientes, vencidas y críticas.
- [ ] Muestra proyectos por empresa (activos/total).
- [ ] Muestra distribución de proyectos y tareas por estado.
- [ ] Muestra próximos vencimientos.
- [ ] El selector Consolidado / por empresa cambia las métricas.

## Calidad técnica

- [ ] `backend: npx tsc --noEmit` sin errores.
- [ ] `frontend: npm run build` compila sin errores de tipos.
- [ ] Todos los endpoints de negocio requieren autenticación (401 sin sesión).
