/**
 * Informe ejecutivo semanal (determinístico, con datos reales).
 *
 * Se entrega el lunes por la mañana y resume la SEMANA ISO QUE TERMINÓ (la
 * anterior a hoy). Reutiliza los services existentes (getConsolidated, finance)
 * para no duplicar lógica financiera. No requiere IA: los números son
 * reales. En la Etapa 3, cuando se active Anthropic, se puede enriquecer con
 * narrativa; por ahora el valor está en el pulso semanal automático por correo.
 */
import type { ExecutiveReport } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { sendEmail, type SendEmailResult } from '../../lib/email';
import { logger } from '../../lib/logger';
import { periodRange, periodKey, currentPeriod } from '../shared/period';
import { getConsolidated, getSummary as getFinanceSummary } from '../finance/finance-summary.service';
import { generateAlerts, listActiveAlerts } from '../alerts/alerts.service';

const DIA_MS = 86_400_000;

// ---------- Formateo ----------

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});
/** Monto en pesos (entero). */
function money(n: number): string {
  return clp.format(Math.round(n ?? 0));
}

// Las fechas del dominio son de calendario ancladas a UTC (ver period.ts); se
// leen en UTC para no correrlas un día por zona horaria.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function ymd(d: Date): { day: string; mon: string; year: number } {
  return {
    day: String(d.getUTCDate()).padStart(2, '0'),
    mon: MESES[d.getUTCMonth()],
    year: d.getUTCFullYear(),
  };
}
/** "06 jul" (o "—" si no hay fecha). */
function fecha(d: Date | null | undefined): string {
  if (!d) return '—';
  const p = ymd(d);
  return `${p.day} ${p.mon}`;
}

// ---------- Semana objetivo ----------

/** La semana ISO que terminó justo antes de `now` (lun–dom). */
export function resolveTargetWeek(now: Date): {
  key: string;
  periodStart: Date;
  periodEnd: Date;
} {
  const currentGte = periodRange('week', currentPeriod('week', now)).gte;
  const prevMonday = new Date(currentGte.getTime() - 7 * DIA_MS);
  const key = periodKey('week', prevMonday);
  const { gte, lt } = periodRange('week', key);
  return { key, periodStart: gte, periodEnd: new Date(lt.getTime() - DIA_MS) };
}

// ---------- Datos ----------

export type WeeklyReportData = Awaited<ReturnType<typeof buildWeeklyReportData>>;

export async function buildWeeklyReportData(now: Date) {
  const { key, periodStart, periodEnd } = resolveTargetWeek(now);
  const { gte, lt } = periodRange('week', key);

  const [consolidated, finance, accrued, ops, alerts] = await Promise.all([
    // Caja, posición, por cobrar/pagar, vencidos, desglose por empresa y
    // reconciliation (cobros/pagos reales de caja de la semana objetivo).
    getConsolidated({ granularity: 'week', period: key }),
    // Solo para `upcomingFinancial` (próximos cobros/pagos según hoy).
    getFinanceSummary(undefined, { granularity: 'week', period: key }),
    weekAccrued(gte, lt),
    operationalCounts(now),
    // Alertas activas del motor determinístico (insights NEW con dedupeKey alert:).
    listActiveAlerts(),
  ]);

  return {
    weekKey: key,
    periodStart,
    periodEnd,
    generatedAt: now,
    // Foto al día
    cash: consolidated.cash,
    position: consolidated.position,
    receivable: consolidated.receivable,
    payable: consolidated.payable,
    overdueReceivable: consolidated.overdueReceivable,
    overduePayable: consolidated.overduePayable,
    byOrganization: consolidated.byOrganization,
    // Semana que terminó
    weekCashIn: consolidated.reconciliation.credits.total,
    weekCashOut: consolidated.reconciliation.charges.total,
    weekAccruedIncome: accrued.income,
    weekAccruedExpense: accrued.expense,
    // Próximos vencimientos (cobros/pagos)
    upcomingFinancial: finance.upcomingFinancial,
    // Alertas activas (motor determinístico)
    alerts,
    // Operación
    ops,
  };
}

/** Ingresos/gastos devengados (por fecha de documento) de la semana objetivo. */
async function weekAccrued(gte: Date, lt: Date) {
  const [inc, exp] = await Promise.all([
    prisma.incomeRecord.aggregate({
      _sum: { amount: true },
      where: { incomeDate: { gte, lt }, status: { not: 'CANCELLED' } },
    }),
    prisma.expenseRecord.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte, lt }, status: { not: 'CANCELLED' } },
    }),
  ]);
  return { income: inc._sum.amount ?? 0, expense: exp._sum.amount ?? 0 };
}

/** Señales de operación (tareas/proyectos) para el bloque final. */
async function operationalCounts(now: Date) {
  const [overdueTasks, criticalTasks, blockedProjects] = await Promise.all([
    prisma.task.count({ where: { dueDate: { lt: now }, status: { notIn: ['DONE'] } } }),
    prisma.task.count({ where: { priority: 'CRITICAL', status: { notIn: ['DONE'] } } }),
    prisma.project.count({ where: { status: 'BLOCKED' } }),
  ]);
  return { overdueTasks, criticalTasks, blockedProjects };
}

// ---------- Render ----------

/** Etiqueta legible del rango de la semana, p. ej. "06–12 jul 2026". */
function weekLabel(d: WeeklyReportData): string {
  const a = ymd(d.periodStart);
  const b = ymd(d.periodEnd);
  if (a.year === b.year && a.mon === b.mon) return `${a.day}–${b.day} ${b.mon} ${b.year}`;
  if (a.year === b.year) return `${a.day} ${a.mon} – ${b.day} ${b.mon} ${b.year}`;
  return `${a.day} ${a.mon} ${a.year} – ${b.day} ${b.mon} ${b.year}`;
}

export function reportSubject(d: WeeklyReportData): string {
  return `Informe ejecutivo semanal · ${weekLabel(d)}`;
}

/** Versión en texto plano (se guarda como `content` y sirve de fallback). */
export function renderText(d: WeeklyReportData): string {
  const l: string[] = [];
  l.push(`INFORME EJECUTIVO SEMANAL — ${weekLabel(d)}`);
  l.push('');
  l.push(`ALERTAS ACTIVAS (${d.alerts.length})`);
  if (d.alerts.length === 0) {
    l.push('  (sin alertas activas)');
  } else {
    for (const a of d.alerts) l.push(`  [${a.priority}] ${a.title}`);
  }
  l.push('');
  l.push('CAJA Y POSICIÓN (al día de hoy)');
  l.push(`  Caja en bancos:      ${money(d.cash)}`);
  l.push(`  Por cobrar:          ${money(d.receivable)}`);
  l.push(`  Por pagar:           ${money(d.payable)}`);
  l.push(`  Posición neta:       ${money(d.position)}  (caja + por cobrar − por pagar)`);
  l.push('');
  l.push('LA SEMANA QUE TERMINÓ');
  l.push(`  Cobros (caja):       ${money(d.weekCashIn)}`);
  l.push(`  Pagos (caja):        ${money(d.weekCashOut)}`);
  l.push(`  Flujo neto de caja:  ${money(d.weekCashIn - d.weekCashOut)}`);
  l.push(`  Facturado (deveng.): ${money(d.weekAccruedIncome)}`);
  l.push(`  Gastado (deveng.):   ${money(d.weekAccruedExpense)}`);
  l.push('');
  l.push('VENCIDOS');
  l.push(`  Por cobrar vencido:  ${money(d.overdueReceivable.amount)} (${d.overdueReceivable.count} doc.)`);
  l.push(`  Por pagar vencido:   ${money(d.overduePayable.amount)} (${d.overduePayable.count} doc.)`);
  l.push('');
  l.push('POR EMPRESA');
  for (const o of d.byOrganization) {
    l.push(`  ${o.name}: caja ${money(o.cash)} · posición ${money(o.position)}`);
  }
  l.push('');
  l.push('PRÓXIMOS COBROS / PAGOS');
  if (d.upcomingFinancial.length === 0) l.push('  (sin vencimientos próximos)');
  for (const u of d.upcomingFinancial) {
    const signo = u.kind === 'INCOME' ? 'Cobro' : 'Pago';
    l.push(`  ${fecha(u.dueDate)} · ${signo} · ${money(u.amount)} · ${u.description ?? u.organization?.name ?? ''}`);
  }
  l.push('');
  l.push('OPERACIÓN');
  l.push(`  Tareas vencidas: ${d.ops.overdueTasks} · críticas abiertas: ${d.ops.criticalTasks} · proyectos bloqueados: ${d.ops.blockedProjects}`);
  return l.join('\n');
}

// --- HTML (email-safe: estilos inline, tablas) ---

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function kpi(label: string, value: string, accent = '#0f172a'): string {
  return `<td style="padding:10px 14px;background:#f8fafc;border-radius:8px;">
    <div style="font-size:12px;color:#64748b;">${esc(label)}</div>
    <div style="font-size:18px;font-weight:700;color:${accent};margin-top:2px;">${esc(value)}</div>
  </td>`;
}

function sectionTitle(t: string): string {
  return `<tr><td style="padding:22px 0 8px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#334155;">${esc(t)}</td></tr>`;
}

export function renderHtml(d: WeeklyReportData): string {
  const flujo = d.weekCashIn - d.weekCashOut;
  const flujoColor = flujo >= 0 ? '#059669' : '#dc2626';

  const upcomingRows = d.upcomingFinancial.length
    ? d.upcomingFinancial
        .map((u) => {
          const signo = u.kind === 'INCOME' ? 'Cobro' : 'Pago';
          const color = u.kind === 'INCOME' ? '#059669' : '#dc2626';
          return `<tr>
            <td style="padding:6px 8px;color:#64748b;white-space:nowrap;">${esc(fecha(u.dueDate))}</td>
            <td style="padding:6px 8px;color:${color};font-weight:600;">${signo}</td>
            <td style="padding:6px 8px;font-weight:600;text-align:right;white-space:nowrap;">${esc(money(u.amount))}</td>
            <td style="padding:6px 8px;color:#334155;">${esc(u.description ?? u.organization?.name ?? '')}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="4" style="padding:6px 8px;color:#94a3b8;">Sin vencimientos próximos.</td></tr>`;

  const orgRows = d.byOrganization
    .map(
      (o) => `<tr>
        <td style="padding:6px 8px;color:#334155;">${esc(o.name)}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${esc(money(o.cash))}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${esc(money(o.receivable))}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${esc(money(o.payable))}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;font-weight:600;">${esc(money(o.position))}</td>
      </tr>`,
    )
    .join('');

  const prioColor = (p: string) =>
    p === 'CRITICAL' || p === 'HIGH' ? '#dc2626' : p === 'MEDIUM' ? '#d97706' : '#64748b';
  const alertRows = d.alerts.length
    ? d.alerts
        .map(
          (a) => `<tr>
            <td style="padding:6px 8px;color:${prioColor(a.priority)};font-weight:600;white-space:nowrap;vertical-align:top;">●</td>
            <td style="padding:6px 8px;color:#334155;"><strong>${esc(a.title)}</strong><br><span style="color:#64748b;font-size:12px;">${esc(a.summary)}</span></td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="2" style="padding:6px 8px;color:#94a3b8;">Sin alertas activas.</td></tr>`;

  return `<!-- Informe ejecutivo semanal VitamCore -->
<div style="margin:0;padding:0;background:#eef2f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

  <tr><td style="background:#0f172a;padding:22px 28px;">
    <div style="color:#94a3b8;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">VitamCore · Dirección Ejecutiva</div>
    <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">Informe ejecutivo semanal</div>
    <div style="color:#cbd5e1;font-size:14px;margin-top:2px;">Semana ${esc(weekLabel(d))}</div>
  </td></tr>

  <tr><td style="padding:24px 28px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8"><tr>
      ${kpi('Caja en bancos', money(d.cash))}
      ${kpi('Posición neta', money(d.position), d.position >= 0 ? '#059669' : '#dc2626')}
    </tr><tr>
      ${kpi('Por cobrar', money(d.receivable))}
      ${kpi('Por pagar', money(d.payable))}
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

      ${sectionTitle(`Alertas activas (${d.alerts.length})`)}
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">${alertRows}</table>
      </td></tr>

      ${sectionTitle('La semana que terminó')}
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
          ${kpi('Cobros (caja)', money(d.weekCashIn), '#059669')}
          ${kpi('Pagos (caja)', money(d.weekCashOut), '#dc2626')}
          ${kpi('Flujo neto', money(flujo), flujoColor)}
        </tr></table>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px;">Devengado: facturado ${esc(money(d.weekAccruedIncome))} · gastado ${esc(money(d.weekAccruedExpense))}</div>
      </td></tr>

      ${sectionTitle('Vencidos')}
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
          ${kpi('Por cobrar vencido', `${money(d.overdueReceivable.amount)} · ${d.overdueReceivable.count} doc.`, d.overdueReceivable.amount > 0 ? '#dc2626' : '#0f172a')}
          ${kpi('Por pagar vencido', `${money(d.overduePayable.amount)} · ${d.overduePayable.count} doc.`, d.overduePayable.amount > 0 ? '#dc2626' : '#0f172a')}
        </tr></table>
      </td></tr>

      ${sectionTitle('Por empresa')}
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
          <tr style="color:#64748b;font-size:11px;text-transform:uppercase;">
            <td style="padding:4px 8px;">Empresa</td>
            <td style="padding:4px 8px;text-align:right;">Caja</td>
            <td style="padding:4px 8px;text-align:right;">Por cobrar</td>
            <td style="padding:4px 8px;text-align:right;">Por pagar</td>
            <td style="padding:4px 8px;text-align:right;">Posición</td>
          </tr>
          ${orgRows}
        </table>
      </td></tr>

      ${sectionTitle('Próximos cobros / pagos')}
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">${upcomingRows}</table>
      </td></tr>

      ${sectionTitle('Operación')}
      <tr><td style="padding-bottom:8px;">
        <div style="font-size:13px;color:#334155;">
          Tareas vencidas: <strong style="color:${d.ops.overdueTasks > 0 ? '#dc2626' : '#0f172a'};">${d.ops.overdueTasks}</strong> ·
          Críticas abiertas: <strong>${d.ops.criticalTasks}</strong> ·
          Proyectos bloqueados: <strong style="color:${d.ops.blockedProjects > 0 ? '#d97706' : '#0f172a'};">${d.ops.blockedProjects}</strong>
        </div>
      </td></tr>

    </table>
  </td></tr>

  <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
    Generado automáticamente por VitamCore · <a href="https://core.vitam.tech" style="color:#64748b;">core.vitam.tech</a>
  </td></tr>

</table>
</td></tr>
</table>
</div>`;
}

// ---------- Persistencia + envío ----------

/** Resumen breve para los campos del ExecutiveReport (String? cada uno). */
function highlightsOf(d: WeeklyReportData): { highlights: string; risks: string } {
  const flujo = d.weekCashIn - d.weekCashOut;
  const highlights = [
    `Caja en bancos: ${money(d.cash)}`,
    `Posición neta: ${money(d.position)}`,
    `Flujo de caja de la semana: ${money(flujo)}`,
  ].join('\n');
  const risks = [
    d.overdueReceivable.amount > 0
      ? `Por cobrar vencido: ${money(d.overdueReceivable.amount)} (${d.overdueReceivable.count} doc.)`
      : null,
    d.overduePayable.amount > 0
      ? `Por pagar vencido: ${money(d.overduePayable.amount)} (${d.overduePayable.count} doc.)`
      : null,
    d.ops.blockedProjects > 0 ? `${d.ops.blockedProjects} proyectos bloqueados` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return { highlights, risks: risks || 'Sin alertas relevantes esta semana.' };
}

/** Genera el informe (datos + render) y lo persiste como ExecutiveReport WEEKLY. */
export async function generateWeeklyReport(now: Date): Promise<{
  data: WeeklyReportData;
  subject: string;
  html: string;
  text: string;
  report: ExecutiveReport;
}> {
  // Refresca las alertas antes de leerlas, para que el informe refleje el
  // estado actual (el cron diario también las mantiene al día entre semanas).
  await generateAlerts();
  const data = await buildWeeklyReportData(now);
  const subject = reportSubject(data);
  const html = renderHtml(data);
  const text = renderText(data);
  const { highlights, risks } = highlightsOf(data);

  const report = await prisma.executiveReport.create({
    data: {
      title: subject,
      reportType: 'WEEKLY',
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      content: text,
      highlights,
      risks,
    },
  });

  return { data, subject, html, text, report };
}

/** Genera, persiste y envía el informe semanal por correo. */
export async function sendWeeklyReport(now: Date): Promise<{
  reportId: string;
  weekKey: string;
  email: SendEmailResult;
}> {
  const { data, subject, html, text, report } = await generateWeeklyReport(now);
  const email = await sendEmail({ subject, html, text });
  logger.info(
    { reportId: report.id, weekKey: data.weekKey, email },
    'Informe semanal generado',
  );
  return { reportId: report.id, weekKey: data.weekKey, email };
}
