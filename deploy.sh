#!/usr/bin/env bash
# =========================================================
# VITAM CORE - Deploy rápido en el VPS (actualizaciones)
# Uso: sudo -u vitam bash /home/vitam/apps/vitamcore/deploy.sh
# (se corre COMO usuario vitam, dueño del repo y de PM2)
# Requiere que el primer setup ya esté hecho (BD, .env, PM2, Nginx).
# =========================================================
set -euo pipefail

APP_DIR=/home/vitam/apps/vitamcore
PM2_NAME=vitamcore-api
export PM2_HOME=/home/vitam/.pm2

echo "==> [1/5] Actualizando código (main)"
cd "$APP_DIR"
git checkout main
git pull origin main

echo "==> [2/5] Backend: deps, prisma, build"
cd "$APP_DIR/backend"
npm install
npx prisma generate
npx prisma migrate deploy
npm run build

echo "==> [3/5] Frontend: deps, build"
cd "$APP_DIR/frontend"
npm install
npm run build

echo "==> [4/5] Reiniciando API en PM2"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  cd "$APP_DIR/backend" && PORT=3007 pm2 start npm --name "$PM2_NAME" -- start
fi

echo "==> [5/5] Guardando estado PM2"
pm2 save

echo "==> Deploy OK → https://core.vitam.tech"
