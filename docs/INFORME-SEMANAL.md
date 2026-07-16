# Informe ejecutivo semanal automático

Cada lunes por la mañana, VitamCore genera un **informe ejecutivo de la semana
que terminó** (caja, posición, cobros/pagos, vencidos, próximos vencimientos,
pipeline comercial y señales de operación) y lo envía por correo al CEO.

Es **determinístico** (números reales, sin IA): funciona sin API key de Claude.
En la Etapa 3, con Anthropic activo, se podrá enriquecer con narrativa.

## Piezas

- `src/modules/reports/weekly-report.service.ts` — compone datos + HTML/texto,
  persiste un `ExecutiveReport` tipo `WEEKLY` y envía el correo. Reutiliza
  `finance` (getConsolidated/getSummary) y `sales` (getSummary).
- `src/lib/email.ts` — envío vía **Resend** (API HTTP con `fetch`, sin dependencia
  extra). Si falta `RESEND_API_KEY`, **no falla**: simula el envío (lo loguea).
- `scripts/weekly-report.ts` — entrada CLI para el cron (`npm run report:weekly`).
- Endpoints (admin): `GET /api/reports/weekly/preview` (previsualizar sin enviar;
  acepta `?format=html|text|json`) y `POST /api/reports/weekly/send` (enviar ahora).

## Configuración (variables de entorno)

En `backend/.env` (local) y en el `.env` del VPS:

```bash
RESEND_API_KEY=re_...            # key de https://resend.com (vacía => se simula)
REPORT_EMAIL_FROM=core@vitam.tech # remitente: dominio verificado en Resend
REPORT_EMAIL_TO=a.bustos@vitam.tech # destinatario(s), separables por coma
REPORT_ENABLED=true              # interruptor del cron
```

### Poner Resend a punto (una vez)

1. Crear cuenta en https://resend.com y una **API key**.
2. **Verificar el dominio `vitam.tech`** en Resend (agregar los registros DNS
   que indica, en Cloudflare). Sin dominio verificado, Resend rechaza el envío.
3. Pegar `RESEND_API_KEY` y `REPORT_EMAIL_TO` en el `.env` del VPS y reiniciar la
   API: `sudo -u vitam bash -c 'PM2_HOME=/home/vitam/.pm2 pm2 restart vitamcore-api --update-env'`.

## Probar

```bash
# Previsualizar en el navegador (logueado como admin):
#   https://core.vitam.tech/api/reports/weekly/preview?format=html

# Generar y enviar ahora desde la terminal del VPS:
cd /home/vitam/apps/vitamcore/backend && sudo -u vitam npm run report:weekly
```

Sin `RESEND_API_KEY` el informe se **persiste igual** y el envío se registra como
simulado en el log (no se manda nada). Con la key, llega el correo.

## Cron (lunes 08:00, hora de Chile)

Instalado en el crontab del usuario `vitam`. Usa `CRON_TZ` para interpretar la
hora en zona de Chile independientemente de la zona del servidor:

```cron
CRON_TZ=America/Santiago
0 8 * * 1 cd /home/vitam/apps/vitamcore/backend && /usr/bin/npx tsx scripts/weekly-report.ts >> /home/vitam/backups/vitamcore/informe-semanal.log 2>&1
```

> Mientras no haya `RESEND_API_KEY`, el cron corre igual y solo persiste + loguea
> (no envía). Es seguro dejarlo instalado desde ya.
