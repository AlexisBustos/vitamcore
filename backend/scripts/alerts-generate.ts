/**
 * Entrada CLI del motor de alertas (para el cron diario del VPS).
 * Uso: npx tsx scripts/alerts-generate.ts   (o: npm run alerts:generate)
 *
 * Ejecuta las reglas determinísticas y reconcilia los insights de alerta.
 * No envía correo: las alertas se ven en el dashboard/IA y en el informe semanal.
 */
import { logger } from '../src/lib/logger';
import { generateAlerts } from '../src/modules/alerts/alerts.service';

async function main() {
  const result = await generateAlerts();
  logger.info({ result }, 'Alertas generadas');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Falló la generación de alertas');
    process.exit(1);
  });
