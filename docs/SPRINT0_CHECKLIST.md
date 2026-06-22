# Checklist de validación — Sprint 0

Marca cada punto al verificarlo en tu entorno local.

## Infraestructura y arranque

- [ ] PostgreSQL corriendo y base de datos `vitamcore` creada.
- [ ] `backend/.env` creado a partir de `.env.example` con `DATABASE_URL` y `JWT_SECRET` (≥ 32 caracteres).
- [ ] `cd backend && npm install` sin errores.
- [ ] `npm run prisma:migrate` genera la migración inicial y crea las tablas.
- [ ] `npm run prisma:seed` crea el usuario CEO y la configuración mínima.
- [ ] `npm run dev` levanta la API en `http://localhost:4000`.
- [ ] `GET http://localhost:4000/api/health` responde `{ "status": "ok" }`.
- [ ] `cd frontend && npm install` sin errores.
- [ ] `npm run dev` levanta el frontend en `http://localhost:5173`.

## Autenticación y seguridad

- [ ] Al entrar sin sesión, se redirige automáticamente a `/login`.
- [ ] Login con `ceo@vitam.tech` / contraseña del seed funciona.
- [ ] Tras iniciar sesión, se redirige al dashboard.
- [ ] La cookie de sesión es `httpOnly` (no accesible por `document.cookie`).
- [ ] `GET /api/auth/me` devuelve el usuario cuando hay sesión y 401 cuando no.
- [ ] Credenciales inválidas devuelven un mensaje genérico (sin revelar si el email existe).
- [ ] Logout limpia la sesión y vuelve a `/login`.
- [ ] Las contraseñas se almacenan como hash bcrypt (verificable en Prisma Studio).
- [ ] El backend falla al iniciar si falta `JWT_SECRET` o `DATABASE_URL`.

## Interfaz

- [ ] El layout muestra sidebar + header + área de contenido.
- [ ] El sidebar lista las 10 secciones: Dashboard, Empresas, Proyectos, Tareas, Ventas, Finanzas, Documentos, Decisiones, IA Ejecutiva, Configuración.
- [ ] El dashboard carga las tarjetas: ingresos, gastos, resultado, proyectos activos, tareas pendientes, ventas abiertas, decisiones pendientes, alertas y recomendación ejecutiva.
- [ ] El selector Consolidado / Vitam Healthcare / Vitam Tech cambia los datos.
- [ ] Las secciones placeholder cargan sin error.
- [ ] El layout es usable en pantalla móvil (sidebar colapsable).

## Calidad técnica

- [ ] Todo el código está en TypeScript.
- [ ] El backend separa controlador / servicio / esquema de validación.
- [ ] El frontend separa presentación, cliente HTTP y estado de sesión.
- [ ] `frontend: npm run build` compila sin errores de tipos.
