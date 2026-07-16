# Backups y restauración — VitamCore

Copias de seguridad de la base de datos PostgreSQL (`vitamcore_db`) en el VPS
(`core.vitam.tech`), con **rotación automática** y una **prueba de restauración**
para garantizar que los backups sirven de verdad (un backup que nunca se probó
no es un backup).

Scripts:
- `scripts/backup-db.sh` — `pg_dump` comprimido + rotación por antigüedad.
- `scripts/restore-db.sh` — restaura un backup a una BD (de prueba por defecto).

---

## 1. Backup manual (primera prueba)

En el VPS, como usuario `vitam`:

```bash
cd /home/vitam/apps/vitamcore
bash scripts/backup-db.sh
```

Debería crear `/home/vitam/backups/vitamcore/vitamcore-AAAAMMDD-HHMMSS.sql.gz`
e informar el tamaño. Si `pg_dump` pide contraseña o falla la conexión, exporta
las variables de Postgres antes de correrlo (ver §5).

## 2. Programar el backup diario (cron)

Instala una entrada de cron para el usuario `vitam` (backup diario a las 03:15):

```bash
crontab -e
```

Añade la línea:

```cron
15 3 * * * cd /home/vitam/apps/vitamcore && /usr/bin/bash scripts/backup-db.sh >> /home/vitam/backups/vitamcore/backup.log 2>&1
```

Comprueba que quedó registrada con `crontab -l`. La rotación (por defecto 14
días) la hace el propio script en cada ejecución.

## 3. Prueba de restauración (⚠️ el paso que da la garantía)

Restaura el último backup a una **BD de prueba** (no toca producción):

```bash
cd /home/vitam/apps/vitamcore
ULTIMO=$(ls -1t /home/vitam/backups/vitamcore/vitamcore-*.sql.gz | head -1)
bash scripts/restore-db.sh "$ULTIMO"          # → restaura en vitamcore_restore_test
```

Verifica que los datos están:

```bash
psql vitamcore_restore_test -c '\dt'                                  # lista de tablas
psql vitamcore_restore_test -c 'SELECT count(*) FROM "User";'         # hay usuarios
psql vitamcore_restore_test -c 'SELECT count(*) FROM "Organization";' # hay empresas
```

Limpia la BD de prueba cuando termines:

```bash
dropdb vitamcore_restore_test
```

> ✅ Si esto funciona, tienes la certeza de que puedes recuperar el sistema ante
> un desastre. Repite esta prueba de vez en cuando (p. ej. una vez al mes).

## 4. Restauración real (recuperación ante desastre)

Solo en caso real de pérdida. Detén la API, restaura sobre la BD real y reinicia:

```bash
pm2 stop vitamcore-api
ULTIMO=$(ls -1t /home/vitam/backups/vitamcore/vitamcore-*.sql.gz | head -1)
bash scripts/restore-db.sh "$ULTIMO" vitamcore_db   # ⚠️ recrea vitamcore_db desde cero
pm2 start vitamcore-api
```

## 5. Conexión a Postgres (si no usas peer auth)

Si los comandos piden credenciales, exporta las variables antes de correr los
scripts (o añádelas a la línea de cron):

```bash
export PGHOST=localhost
export PGUSER=vitamcore
export PGPASSWORD='...'      # la misma de DATABASE_URL en backend/.env
export DB_NAME=vitamcore_db
```

## 6. Recomendado a futuro (fuera de alcance de esta etapa)

- **Copia off-site**: subir el `.sql.gz` a S3/R2 tras cada backup (si el VPS
  muere, el backup no debería morir con él).
- **Alerta si el backup falla**: revisar `backup.log` o notificar por correo
  (se integra bien con el email de la Etapa 2).
