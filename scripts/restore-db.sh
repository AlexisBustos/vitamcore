#!/usr/bin/env bash
# =========================================================
# VITAM CORE - Restaurar un backup de la base de datos
# Uso:
#   bash restore-db.sh <archivo.sql.gz> [bd_destino]
#
# Por defecto restaura a una BD de PRUEBA (vitamcore_restore_test) para poder
# verificar el backup SIN tocar la base de producción. Para restaurar de verdad
# sobre producción, pasa explícitamente el nombre real como segundo argumento
# (¡con cuidado, la recrea desde cero!).
# =========================================================
set -euo pipefail

FILE="${1:?Uso: restore-db.sh <archivo.sql.gz> [bd_destino]}"
TARGET_DB="${2:-vitamcore_restore_test}"

if [[ ! -s "$FILE" ]]; then
  echo "!! ERROR: no existe o está vacío: $FILE" >&2
  exit 1
fi

echo "==> Recreando BD de destino: $TARGET_DB"
dropdb --if-exists "$TARGET_DB"
createdb "$TARGET_DB"

echo "==> Restaurando $FILE en $TARGET_DB"
gunzip -c "$FILE" | psql --quiet --set ON_ERROR_STOP=on "$TARGET_DB"

echo "==> Restore OK. Resumen de tablas restauradas:"
psql --quiet "$TARGET_DB" -c \
  "SELECT count(*) AS tablas FROM information_schema.tables WHERE table_schema='public';"

echo "==> Verifica manualmente, p. ej.:  psql $TARGET_DB -c '\\dt'"
