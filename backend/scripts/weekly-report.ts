/**
 * Entrada CLI del informe ejecutivo semanal (para el cron del VPS).
 * Uso: npx tsx scripts/weekly-report.ts   (o: npm run report:weekly)
 *
 * Genera, persiste y envía el informe de la semana que terminó. Si REPORT_ENABLED
 * es false, no hace nada. Si falta RESEND_API_KEY / REPORT_EMAIL_TO, el envío se
 * simula (se loguea) y el informe igual queda persistido.
 */
import { env } from '../src/config/env';
import { logger } from '../src/lib/logger';
import { sendWeeklyReport } from '../src/modules/reports/weekly-report.service';

async function main() {
  if (!env.REPORT_ENABLED) {
    logger.warn('REPORT_ENABLED=false: informe semanal desactivado, no se envía.');
    return;
  }
  const result = await sendWeeklyReport(new Date());
  logger.info({ result }, 'Informe semanal procesado');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Falló la generación del informe semanal');
    process.exit(1);
  });
