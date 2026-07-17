/**
 * Barrel del módulo finance: mantiene la API pública estable (usada por el
 * controller, el dashboard y la capa de agente) tras dividir la lógica en
 * finance-summary.service y finance-reconciliation.service.
 */
export { getSummary, getConsolidated } from './finance-summary.service';
export { getTrend } from './finance-trend.service';
export {
  getReconciliationSummary,
  autoReconcile,
  recognizeTransfers,
} from './finance-reconciliation.service';
