# Despliegue de VitamCore en el VPS (Vultr Santiago)

Plataforma interna del CEO. Mismo patrón que **Alox**: frontend React+Vite estático
servido por Nginx + API Express/TS en PM2 + PostgreSQL local. Todo bajo un solo
dominio (`core.vitam.tech`), sin CORS cruzado.

## Datos del despliegue

| Item | Valor |
|---|---|
| Dominio | `https://core.vitam.tech` |
| VPS | `64.176.18.197` (Ubuntu 24.04, usuario apps `vitam`) |
| Puerto API (PM2) | `3007` |
| Nombre PM2 | `vitamcore-api` |
| Base de datos | `vitamcore_db` (Postgres local, usuario `vitam`) |
| Carpeta en el VPS | `/home/vitam/apps/vitamcore` |
| Repo | `github.com/AlexisBustos/vitamcore` (deploy desde `main`) |

## Primer setup (una sola vez)

Prerrequisito: registro DNS **A** `core.vitam.tech → 64.176.18.197` en Cloudflare (DNS only).

```bash
# 0) Desde tu PC: subir el dump de la BD local (con tu estructura real)
scp backups/vitamcore_prod_seed.sql root@64.176.18.197:/home/vitam/backups/

# 1) Conectarse
ssh root@64.176.18.197

# 2) Crear la base
sudo -u postgres createdb vitamcore_db -O vitam

# 3) Restaurar el dump local en la base
sudo -u postgres psql vitamcore_db < /home/vitam/backups/vitamcore_prod_seed.sql

# 4) Clonar el repo
cd /home/vitam/apps
git clone https://github.com/AlexisBustos/vitamcore.git
cd vitamcore
git checkout main

# 5) Crear el .env de producción del backend
cp backend/.env.production.example backend/.env
nano backend/.env      # pegar JWT_SECRET real; el resto ya viene correcto

# 6) Backend: deps, prisma, build
cd backend
npm install
npx prisma generate
npx prisma migrate deploy          # no-op si el dump ya trae _prisma_migrations
npm run build

# 7) Fijar contraseña del CEO y quitar cuentas demo
PROD_CEO_EMAIL=ceo@vitam.tech PROD_CEO_PASSWORD='<PASSWORD_CEO>' \
  npx tsx prisma/scripts/preparar-produccion.ts

# 8) Frontend: deps, build
cd ../frontend
npm install
npm run build

# 9) Arrancar la API en PM2 (usuario vitam) en el puerto 3007
sudo -u vitam bash -c 'cd /home/vitam/apps/vitamcore/backend && PM2_HOME=/home/vitam/.pm2 PORT=3007 pm2 start npm --name vitamcore-api -- start'
sudo -u vitam bash -c 'PM2_HOME=/home/vitam/.pm2 pm2 save'

# 10) Nginx + SSL
cp docs/deploy/core.vitam.tech.nginx.conf /etc/nginx/sites-available/core.vitam.tech
ln -s /etc/nginx/sites-available/core.vitam.tech /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d core.vitam.tech

# 11) Probar
curl -s https://core.vitam.tech/api/health
```

## Actualizaciones posteriores

```bash
sudo bash /home/vitam/apps/vitamcore/deploy.sh
```

## Backup diario de la base

```bash
# Crontab de root: backup a las 03:15 y retención de 14 días
crontab -e
15 3 * * * pg_dump -U vitam vitamcore_db > /home/vitam/backups/vitamcore_$(date +\%Y\%m\%d).sql && find /home/vitam/backups -name 'vitamcore_*.sql' -mtime +14 -delete
```

## Notas

- La cookie de sesión es `httpOnly` + `secure` (prod) + `sameSite=lax`. Requiere HTTPS
  y mismo dominio → por eso Nginx sirve frontend y API juntos. Express tiene
  `trust proxy` activado para respetarlo detrás del reverse proxy.
- El agente IA queda en modo `heuristic` (sin costo). Para activar Claude: setear
  `AGENT_PROVIDER=anthropic` + `AGENT_API_KEY` en `backend/.env` y reiniciar.
- Documentos: solo metadatos por ahora (sin archivo físico). Ver `docs/STORAGE.md`.
