#!/usr/bin/env bash
# =========================================================
# VITAM CORE - Backup de la base de datos (pg_dump + rotación)
# Uso típico (en el VPS, como usuario vitam):
#   bash /home/vitam/apps/vitamcore/scripts/backup-db.sh
#
# Variables de entorno (con valores por defecto):
#   DB_NAME         nombre de la BD           (def: vitamcore_db)
#   BACKUP_DIR      carpeta de destino        (def: /home/vitam/backups/vitamcore)
#   RETENTION_DAYS  días a conservar          (def: 14)
#   PGHOST/PGUSER/PGPASSWORD  conexión Postgres (si no usas peer auth)
# =========================================================
set -euo pipefail

DB_NAME="${DB_NAME:-vitamcore_db}"
BACKUP_DIR="${BACKUP_DIR:-/home/vitam/backups/vitamcore}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TS="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/vitamcore-$TS.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Volcando $DB_NAME → $FILE"
# --no-owner / --no-acl facilitan restaurar en una BD/usuario distinto.
pg_dump --no-owner --no-acl "$DB_NAME" | gzip > "$FILE"

# Verificación mínima: el archivo existe y no está vacío.
if [[ ! -s "$FILE" ]]; then
  echo "!! ERROR: el backup quedó vacío ($FILE)" >&2
  exit 1
fi
echo "==> Backup OK ($(du -h "$FILE" | cut -f1))"

echo "==> Rotación: borrando backups de más de ${RETENTION_DAYS} días"
find "$BACKUP_DIR" -name 'vitamcore-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "==> Listo. Backups actuales:"
ls -1t "$BACKUP_DIR"/vitamcore-*.sql.gz 2>/dev/null | head -5
