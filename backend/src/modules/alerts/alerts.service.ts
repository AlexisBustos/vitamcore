/**
 * Motor de alertas determinístico.
 *
 * Corre un conjunto fijo de reglas sobre datos reales (finanzas, tareas,
 * proyectos) y materializa cada hallazgo como un `AgentInsight`. NO usa IA: son
 * reglas auditables. Al persistir en el mismo modelo que usaría la IA, el
 * sistema queda "listo para IA" sin depender de ella: el flujo de revisión
 * (marcar revisado/accionado/descartado) es el mismo hoy y mañana.
 *
 * Idempotencia: cada regla produce una `dedupeKey` estable con prefijo "alert:".
 * En cada corrida se reconcilia el estado:
 *  - alerta activa con insight abierto (NEW/REVIEWED/ACTIONED) → se actualiza.
 *  - alerta activa sin insight abierto → se crea uno NEW.
 *  - insight NEW cuya condición ya no aplica → se auto-descarta (DISMISSED).
 *    Los REVIEWED/ACTIONED no se tocan: son parte del trabajo del usuario.
 */
import type { AgentType, InsightType, Priority } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { computeOverdue, computeUpcoming } from '../finance/finance-shared';

/** Horizonte (días) para "por vencer". */
const UPCOMING_DAYS = 7;
/** Días sin actividad (updatedAt) para considerar un proyecto "estancado". */
const STALE_DAYS = 21;

/** Prefijo de todas las dedupeKey generadas por el motor. */
const ALERT_PREFIX = 'alert:';

const money = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

interface AlertDef {
  dedupeKey: string;
  organizationId: string | null;
  agentType: AgentType;
  type: InsightType;
  priority: Priority;
  title: string;
  summary: string;
  evidence?: string | null;
  recommendation?: string | null;
}

export interface AlertRunResult {
  active: number;
  created: number;
  updated: number;
  dismissed: number;
}

/** Ejecuta todas las reglas y reconcilia los insights. Punto de entrada. */
export async function generateAlerts(): Promise<AlertRunResult> {
  const alerts = await collectAlerts();
  const activeKeys = new Set(alerts.map((a) => a.dedupeKey));

  // Insights del motor actualmente "abiertos".
  const existing = await prisma.agentInsight.findMany({
    where: {
      dedupeKey: { startsWith: ALERT_PREFIX },
      status: { in: ['NEW', 'REVIEWED', 'ACTIONED'] },
    },
  });
  const byKey = new Map(existing.map((e) => [e.dedupeKey as string, e]));

  let created = 0;
  let updated = 0;

  for (const a of alerts) {
    const cur = byKey.get(a.dedupeKey);
    if (cur) {
      await prisma.agentInsight.update({
        where: { id: cur.id },
        data: {
          title: a.title,
          summary: a.summary,
          evidence: a.evidence ?? null,
          recommendation: a.recommendation ?? null,
          priority: a.priority,
          type: a.type,
          agentType: a.agentType,
          organizationId: a.organizationId,
        },
      });
      updated++;
    } else {
      await prisma.agentInsight.create({
        data: {
          dedupeKey: a.dedupeKey,
          title: a.title,
          summary: a.summary,
          evidence: a.evidence ?? null,
          recommendation: a.recommendation ?? null,
          priority: a.priority,
          type: a.type,
          agentType: a.agentType,
          organizationId: a.organizationId,
          status: 'NEW',
        },
      });
      created++;
    }
  }

  // Auto-descartar las alertas NEW cuya condición ya no aplica.
  const toDismiss = existing.filter(
    (e) => e.status === 'NEW' && !activeKeys.has(e.dedupeKey as string),
  );
  let dismissed = 0;
  if (toDismiss.length) {
    await prisma.agentInsight.updateMany({
      where: { id: { in: toDismiss.map((e) => e.id) } },
      data: { status: 'DISMISSED' },
    });
    dismissed = toDismiss.length;
  }

  const result = { active: alerts.length, created, updated, dismissed };
  logger.info(result, 'Motor de alertas ejecutado');
  return result;
}

/** Reúne las alertas de todas las empresas activas. */
async function collectAlerts(): Promise<AlertDef[]> {
  const orgs = await prisma.organization.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const perOrg = await Promise.all(
    orgs.map(async (org) => [
      ...(await financeAlerts(org)),
      ...(await opsAlerts(org)),
    ]),
  );
  return perOrg.flat();
}

// ---------------------------------------------------------
// Reglas financieras (cobros / pagos)
// ---------------------------------------------------------

async function financeAlerts(org: { id: string; name: string }): Promise<AlertDef[]> {
  const [overdue, upcoming] = await Promise.all([
    computeOverdue(org.id),
    computeUpcoming(org.id, UPCOMING_DAYS),
  ]);
  const out: AlertDef[] = [];

  if (overdue.overdueReceivable.amount > 0) {
    const { amount, count } = overdue.overdueReceivable;
    out.push({
      dedupeKey: `${ALERT_PREFIX}overdue-receivable:${org.id}`,
      organizationId: org.id,
      agentType: 'FINANCE',
      type: 'FINANCIAL',
      priority: 'HIGH',
      title: `${org.name}: cobros vencidos por ${money.format(amount)}`,
      summary: `Hay ${count} factura(s) por cobrar vencida(s) por un total de ${money.format(amount)}.`,
      recommendation: 'Gestionar la cobranza de las facturas vencidas para recuperar caja.',
    });
  }

  if (upcoming.upcomingReceivable.amount > 0) {
    const { amount, count } = upcoming.upcomingReceivable;
    out.push({
      dedupeKey: `${ALERT_PREFIX}upcoming-receivable:${org.id}`,
      organizationId: org.id,
      agentType: 'FINANCE',
      type: 'FINANCIAL',
      priority: 'MEDIUM',
      title: `${org.name}: cobros por vencer (${UPCOMING_DAYS} días)`,
      summary: `${count} factura(s) por cobrar vence(n) en los próximos ${UPCOMING_DAYS} días por ${money.format(amount)}.`,
      recommendation: 'Confirmar el cobro antes del vencimiento para no engrosar los vencidos.',
    });
  }

  if (overdue.overduePayable.amount > 0) {
    const { amount, count } = overdue.overduePayable;
    out.push({
      dedupeKey: `${ALERT_PREFIX}overdue-payable:${org.id}`,
      organizationId: org.id,
      agentType: 'FINANCE',
      type: 'FINANCIAL',
      priority: 'HIGH',
      title: `${org.name}: pagos vencidos por ${money.format(amount)}`,
      summary: `Hay ${count} obligación(es) por pagar vencida(s) por un total de ${money.format(amount)}.`,
      recommendation: 'Regularizar los pagos vencidos para evitar recargos o cortes de servicio.',
    });
  }

  if (upcoming.upcomingPayable.amount > 0) {
    const { amount, count } = upcoming.upcomingPayable;
    out.push({
      dedupeKey: `${ALERT_PREFIX}upcoming-payable:${org.id}`,
      organizationId: org.id,
      agentType: 'FINANCE',
      type: 'FINANCIAL',
      priority: 'MEDIUM',
      title: `${org.name}: pagos por vencer (${UPCOMING_DAYS} días)`,
      summary: `${count} obligación(es) por pagar vence(n) en los próximos ${UPCOMING_DAYS} días por ${money.format(amount)}.`,
      recommendation: 'Asegurar la caja para cubrir los pagos que vencen esta semana.',
    });
  }

  return out;
}

// ---------------------------------------------------------
// Reglas de operación (tareas / proyectos)
// ---------------------------------------------------------

async function opsAlerts(org: { id: string; name: string }): Promise<AlertDef[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000);

  const [overdueTasks, criticalOverdue, blocked, stale] = await Promise.all([
    prisma.task.count({
      where: { organizationId: org.id, dueDate: { lt: now }, status: { not: 'DONE' } },
    }),
    prisma.task.count({
      where: {
        organizationId: org.id,
        dueDate: { lt: now },
        status: { not: 'DONE' },
        priority: 'CRITICAL',
      },
    }),
    prisma.project.count({
      where: { organizationId: org.id, status: 'BLOCKED' },
    }),
    prisma.project.count({
      where: {
        organizationId: org.id,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'PAUSED', 'IDEA', 'BLOCKED'] },
        updatedAt: { lt: staleBefore },
      },
    }),
  ]);
  const out: AlertDef[] = [];

  if (overdueTasks > 0) {
    out.push({
      dedupeKey: `${ALERT_PREFIX}overdue-tasks:${org.id}`,
      organizationId: org.id,
      agentType: 'PROJECT',
      type: 'TASK',
      priority: criticalOverdue > 0 ? 'HIGH' : 'MEDIUM',
      title: `${org.name}: ${overdueTasks} tarea(s) vencida(s)`,
      summary:
        `${overdueTasks} tarea(s) sin terminar pasaron su fecha de vencimiento` +
        (criticalOverdue > 0 ? `, ${criticalOverdue} de ellas crítica(s).` : '.'),
      recommendation: 'Reprogramar o cerrar las tareas vencidas; priorizar las críticas.',
    });
  }

  if (blocked > 0) {
    out.push({
      dedupeKey: `${ALERT_PREFIX}blocked-projects:${org.id}`,
      organizationId: org.id,
      agentType: 'PROJECT',
      type: 'PROJECT',
      priority: 'HIGH',
      title: `${org.name}: ${blocked} proyecto(s) bloqueado(s)`,
      summary: `${blocked} proyecto(s) están en estado bloqueado y requieren desbloqueo.`,
      recommendation: 'Asignar responsable y próxima acción a cada proyecto bloqueado.',
    });
  }

  if (stale > 0) {
    out.push({
      dedupeKey: `${ALERT_PREFIX}stale-projects:${org.id}`,
      organizationId: org.id,
      agentType: 'PROJECT',
      type: 'PROJECT',
      priority: 'MEDIUM',
      title: `${org.name}: ${stale} proyecto(s) sin actividad`,
      summary: `${stale} proyecto(s) activo(s) no registran cambios hace más de ${STALE_DAYS} días.`,
      recommendation: 'Revisar el estado real de los proyectos estancados y definir su próximo paso.',
    });
  }

  return out;
}

/** Lee las alertas activas (insights del motor en estado NEW). Para reportes/UI. */
export function listActiveAlerts() {
  return prisma.agentInsight.findMany({
    where: { dedupeKey: { startsWith: ALERT_PREFIX }, status: 'NEW' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
}
