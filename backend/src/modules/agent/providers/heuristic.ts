/**
 * Proveedor heurístico del Agent Layer.
 *
 * Funciona SIN modelo de IA externo: consulta las herramientas internas y
 * construye respuestas ejecutivas reales con el formato de 6 secciones.
 * Es el modo por defecto y permite operar el agente sin API key.
 */
import { prisma } from '../../../lib/prisma';
import { getSummary as getSalesSummary } from '../../sales/sales.service';
import { getSummary as getFinanceSummary } from '../../finance/finance.service';
import { callReadTool, type ToolContext } from '../tools';
import type {
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  QuickIntent,
} from './types';

const money = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});
const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-CL') : '—';

interface Section {
  resumen: string[];
  hechos: string[];
  riesgos: string[];
  recomendaciones: string[];
  acciones: string[];
  faltante: string[];
}

function render(s: Section): string {
  const block = (title: string, items: string[]) =>
    `## ${title}\n` +
    (items.length ? items.map((i) => `- ${i}`).join('\n') : '- Sin elementos.');
  return [
    block('1. Resumen ejecutivo', s.resumen),
    block('2. Hechos observados', s.hechos),
    block('3. Riesgos o alertas', s.riesgos),
    block('4. Recomendaciones', s.recomendaciones),
    block('5. Próximas acciones sugeridas', s.acciones),
    block('6. Información faltante o incertidumbres', s.faltante),
  ].join('\n\n');
}

async function resolveOrg(type: 'HEALTHCARE' | 'TECHNOLOGY') {
  return prisma.organization.findFirst({ where: { type } });
}

export class HeuristicProvider implements AgentProvider {
  readonly name = 'heuristic';

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const intent = input.intent ?? detectIntent(input.message);
    const ctx: ToolContext = {
      agentType: input.agentType,
      organizationId: input.organizationId,
      projectId: input.projectId,
    };
    const toolsUsed: string[] = [];

    let content: string;
    switch (intent) {
      case 'healthcare-summary':
        content = await this.orgSummary('HEALTHCARE', toolsUsed);
        break;
      case 'tech-summary':
        content = await this.orgSummary('TECHNOLOGY', toolsUsed);
        break;
      case 'financial-analysis':
        content = await this.finance(input.organizationId, toolsUsed);
        break;
      case 'sales-follow-up':
        content = await this.sales(input.organizationId, toolsUsed);
        break;
      case 'project-risks':
        content = await this.projectRisks(input.organizationId, toolsUsed);
        break;
      case 'weekly-plan':
        content = await this.weeklyPlan(input.organizationId, toolsUsed);
        break;
      case 'documents-recent':
        content = await this.documents(input.organizationId, ctx, toolsUsed);
        break;
      default:
        content = await this.executive(input.organizationId, toolsUsed);
    }

    return { content, toolsUsed: [...new Set(toolsUsed)], provider: this.name };
  }

  /** Resumen ejecutivo consolidado o por empresa. */
  private async executive(orgId: string | null | undefined, used: string[]) {
    const [orgs, finance, sales] = await Promise.all([
      prisma.organization.findMany({
        include: { _count: { select: { projects: true, tasks: true } } },
      }),
      getFinanceSummary(orgId || undefined),
      getSalesSummary(orgId || undefined),
    ]);
    used.push('getOrganizations', 'getFinancialSummary', 'getSalesOpportunities');

    const [blocked, criticalTasks, overdueTasks, activeDecisions] =
      await Promise.all([
        prisma.project.count({ where: orgWhere(orgId, { status: 'BLOCKED' }) }),
        prisma.task.count({
          where: orgWhere(orgId, {
            priority: 'CRITICAL',
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          }),
        }),
        prisma.task.count({
          where: orgWhere(orgId, {
            dueDate: { lt: new Date() },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          }),
        }),
        prisma.strategicDecision.count({
          where: orgWhere(orgId, { status: 'ACTIVE' }),
        }),
      ]);
    used.push('getProjects', 'getTasks', 'getStrategicDecisions');

    const scope = orgId
      ? orgs.find((o) => o.id === orgId)?.name ?? 'la empresa'
      : 'consolidado (Vitam Healthcare + Vitam Tech)';

    const s: Section = {
      resumen: [
        `Visión ${scope}. Resultado estimado del mes: ${money.format(
          finance.estimatedResult,
        )} (ingresos ${money.format(finance.monthIncome)}, gastos ${money.format(
          finance.monthExpense,
        )}).`,
        `Pipeline comercial abierto: ${sales.openCount} oportunidades, ${money.format(
          sales.openAmount,
        )} (ponderado ${money.format(sales.weightedAmount)}).`,
      ],
      hechos: [
        `Proyectos bloqueados: ${blocked}. Tareas críticas abiertas: ${criticalTasks}. Tareas vencidas: ${overdueTasks}.`,
        `Decisiones estratégicas activas: ${activeDecisions}.`,
        `Oportunidades sin seguimiento: ${sales.noFollowUpCount}.`,
        ...orgs.map(
          (o) =>
            `${o.name}: ${o._count.projects} proyectos, ${o._count.tasks} tareas.`,
        ),
      ],
      riesgos: [
        ...(finance.estimatedResult < 0
          ? ['Resultado del mes negativo: revisar gastos e ingresos pendientes.']
          : []),
        ...(finance.overdueExpense.count > 0
          ? [
              `${finance.overdueExpense.count} gasto(s) vencido(s) por ${money.format(
                finance.overdueExpense.amount,
              )}.`,
            ]
          : []),
        ...(blocked > 0 ? [`${blocked} proyecto(s) bloqueado(s).`] : []),
        ...(sales.noFollowUpCount > 0
          ? [`${sales.noFollowUpCount} oportunidad(es) sin seguimiento.`]
          : []),
      ],
      recomendaciones: [
        criticalTasks > 0
          ? `Atender primero las ${criticalTasks} tareas críticas abiertas.`
          : 'No hay tareas críticas abiertas; mantener foco en el pipeline.',
        sales.openCount > 0
          ? 'Avanzar las oportunidades de mayor monto ponderado para asegurar el resultado.'
          : 'Generar nuevas oportunidades comerciales.',
      ],
      acciones: [
        ...(blocked > 0 ? ['Desbloquear los proyectos detenidos.'] : []),
        ...(sales.noFollowUpCount > 0
          ? ['Agendar seguimiento de las oportunidades sin próxima fecha.']
          : []),
        'Revisar los vencimientos financieros y de tareas de la semana.',
      ],
      faltante: [
        'Las cifras provienen de los datos cargados en VITAM CORE; su exactitud depende de que estén actualizados.',
      ],
    };
    return render(s);
  }

  private async orgSummary(
    type: 'HEALTHCARE' | 'TECHNOLOGY',
    used: string[],
  ) {
    const org = await resolveOrg(type);
    if (!org) {
      return render({
        resumen: [`No se encontró la empresa de tipo ${type}.`],
        hechos: [],
        riesgos: [],
        recomendaciones: [],
        acciones: [],
        faltante: ['La empresa no existe en el sistema.'],
      });
    }
    return this.executive(org.id, used);
  }

  private async finance(orgId: string | null | undefined, used: string[]) {
    const f = await getFinanceSummary(orgId || undefined);
    used.push('getFinancialSummary', 'getIncomeRecords', 'getExpenseRecords');

    const s: Section = {
      resumen: [
        `Resultado estimado del mes: ${money.format(f.estimatedResult)}.`,
        `Ingresos ${money.format(f.monthIncome)} · Gastos ${money.format(
          f.monthExpense,
        )}.`,
      ],
      hechos: [
        `Ingresos pendientes: ${money.format(f.pendingIncome)}. Gastos pendientes: ${money.format(
          f.pendingExpense,
        )}.`,
        `Recurrentes — ingresos ${money.format(f.recurringIncome)}, gastos ${money.format(
          f.recurringExpense,
        )}.`,
        ...f.byOrganization.map(
          (o) =>
            `${o.name}: resultado ${money.format(o.result)} (ingresos ${money.format(
              o.income,
            )}, gastos ${money.format(o.expense)}).`,
        ),
        ...f.expenseByCategory
          .slice(0, 5)
          .map((c) => `Gasto categoría "${c.category}": ${money.format(c.amount)}.`),
      ],
      riesgos: [
        ...(f.overdueIncome.count > 0
          ? [
              `${f.overdueIncome.count} ingreso(s) vencido(s) por ${money.format(
                f.overdueIncome.amount,
              )}.`,
            ]
          : []),
        ...(f.overdueExpense.count > 0
          ? [
              `${f.overdueExpense.count} gasto(s) vencido(s) por ${money.format(
                f.overdueExpense.amount,
              )}.`,
            ]
          : []),
        ...(f.estimatedResult < 0 ? ['Resultado mensual negativo.'] : []),
      ],
      recomendaciones: [
        f.pendingIncome > 0
          ? 'Gestionar la cobranza de los ingresos pendientes para mejorar el flujo.'
          : 'Flujo de ingresos al día.',
        f.overdueExpense.count > 0
          ? 'Regularizar los gastos vencidos para evitar recargos.'
          : 'Mantener el control de gastos recurrentes.',
      ],
      acciones: [
        ...f.upcomingFinancial
          .slice(0, 4)
          .map(
            (u) =>
              `${u.kind === 'INCOME' ? 'Cobrar' : 'Pagar'} "${u.description}" (${money.format(
                u.amount,
              )}, vence ${date(u.dueDate)}).`,
          ),
      ],
      faltante: [
        'Control ejecutivo de caja; no reemplaza la contabilidad formal.',
      ],
    };
    return render(s);
  }

  private async sales(orgId: string | null | undefined, used: string[]) {
    const [summary, noFollowUp] = await Promise.all([
      getSalesSummary(orgId || undefined),
      callReadTool(
        'getSalesOpportunities',
        {},
        { agentType: 'SALES', organizationId: orgId },
      ),
    ]);
    used.push('getSalesOpportunities', 'getOrganizations');
    const openList = (noFollowUp as any[]).filter(
      (o) => !['WON', 'LOST'].includes(o.status),
    );

    const s: Section = {
      resumen: [
        `Pipeline abierto: ${summary.openCount} oportunidades por ${money.format(
          summary.openAmount,
        )} (ponderado ${money.format(summary.weightedAmount)}).`,
        `Ganadas: ${summary.wonCount} · Perdidas: ${summary.lostCount}.`,
      ],
      hechos: [
        `Oportunidades sin seguimiento: ${summary.noFollowUpCount}.`,
        ...openList
          .slice(0, 6)
          .map(
            (o) =>
              `${o.opportunityName} (${o.organization?.name ?? '—'}): ${money.format(
                o.estimatedAmount,
              )}, ${o.probability}%, seguimiento ${date(o.nextFollowUpDate)}.`,
          ),
      ],
      riesgos: [
        ...(summary.noFollowUpCount > 0
          ? [
              `${summary.noFollowUpCount} oportunidad(es) sin próxima fecha de seguimiento: riesgo de enfriamiento.`,
            ]
          : []),
      ],
      recomendaciones: [
        'Priorizar las oportunidades de mayor monto ponderado.',
        summary.noFollowUpCount > 0
          ? 'Definir próxima acción y fecha para las oportunidades sin seguimiento.'
          : 'Mantener la cadencia de seguimiento del pipeline.',
      ],
      acciones: summary.upcomingFollowUps
        .slice(0, 5)
        .map(
          (o) =>
            `Seguimiento de "${o.opportunityName}" (${o.clientName}) el ${date(
              o.nextFollowUpDate,
            )}.`,
        ),
      faltante: [
        'La probabilidad y los montos son estimaciones cargadas manualmente.',
      ],
    };
    return render(s);
  }

  private async projectRisks(orgId: string | null | undefined, used: string[]) {
    const [blocked, noNext, overdueTasks, criticalTasks] = await Promise.all([
      prisma.project.findMany({
        where: orgWhere(orgId, { status: 'BLOCKED' }),
        include: { organization: { select: { name: true } } },
        take: 20,
      }),
      prisma.project.findMany({
        where: orgWhere(orgId, {
          OR: [{ nextAction: null }, { nextAction: '' }],
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        }),
        include: { organization: { select: { name: true } } },
        take: 20,
      }),
      prisma.task.findMany({
        where: orgWhere(orgId, {
          dueDate: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        }),
        include: { project: { select: { name: true } } },
        take: 20,
      }),
      prisma.task.count({
        where: orgWhere(orgId, {
          priority: 'CRITICAL',
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        }),
      }),
    ]);
    used.push('getProjects', 'getTasks');

    const s: Section = {
      resumen: [
        `${blocked.length} proyecto(s) bloqueado(s), ${noNext.length} sin próxima acción, ${overdueTasks.length} tarea(s) vencida(s), ${criticalTasks} tarea(s) crítica(s).`,
      ],
      hechos: [
        ...blocked.map(
          (p) => `Bloqueado: ${p.name} (${p.organization.name}). Riesgo: ${p.risks ?? 'no declarado'}.`,
        ),
        ...overdueTasks
          .slice(0, 8)
          .map(
            (t) =>
              `Tarea vencida: ${t.title}${t.project ? ` (${t.project.name})` : ''}, venció ${date(
                t.dueDate,
              )}.`,
          ),
      ],
      riesgos: [
        ...(blocked.length ? [`${blocked.length} proyecto(s) detenido(s).`] : []),
        ...(noNext.length
          ? [`${noNext.length} proyecto(s) activo(s) sin próxima acción definida.`]
          : []),
        ...(overdueTasks.length
          ? [`${overdueTasks.length} tarea(s) vencida(s).`]
          : []),
      ],
      recomendaciones: [
        blocked.length
          ? 'Resolver los bloqueos asignando responsable y próxima acción.'
          : 'Sin bloqueos; mantener el ritmo de avance.',
        noNext.length
          ? 'Definir próxima acción para cada proyecto activo sin una.'
          : 'Todos los proyectos activos tienen próxima acción.',
      ],
      acciones: [
        ...noNext.slice(0, 5).map((p) => `Definir próxima acción para "${p.name}".`),
        ...blocked.slice(0, 3).map((p) => `Reunión para desbloquear "${p.name}".`),
      ],
      faltante: [
        'Los riesgos provienen del campo declarado en cada proyecto; pueden existir riesgos no registrados.',
      ],
    };
    return render(s);
  }

  private async weeklyPlan(orgId: string | null | undefined, used: string[]) {
    const now = new Date();
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);

    const [dueTasks, followUps, finance] = await Promise.all([
      prisma.task.findMany({
        where: orgWhere(orgId, {
          dueDate: { lte: in7 },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        }),
        orderBy: { dueDate: 'asc' },
        include: { project: { select: { name: true } } },
        take: 15,
      }),
      prisma.salesOpportunity.findMany({
        where: orgWhere(orgId, {
          nextFollowUpDate: { gte: now, lte: in7 },
          status: { notIn: ['WON', 'LOST'] },
        }),
        orderBy: { nextFollowUpDate: 'asc' },
        take: 10,
      }),
      getFinanceSummary(orgId || undefined),
    ]);
    used.push('getTasks', 'getSalesOpportunities', 'getFinancialSummary');

    const finUpcoming = finance.upcomingFinancial.filter(
      (u) => u.dueDate && new Date(u.dueDate) <= in7,
    );

    const s: Section = {
      resumen: [
        `Plan para los próximos 7 días: ${dueTasks.length} tarea(s), ${followUps.length} seguimiento(s) comercial(es) y ${finUpcoming.length} vencimiento(s) financiero(s).`,
      ],
      hechos: [
        ...dueTasks
          .slice(0, 8)
          .map(
            (t) =>
              `Tarea: ${t.title}${t.project ? ` (${t.project.name})` : ''} — vence ${date(
                t.dueDate,
              )} [${t.priority}].`,
          ),
        ...followUps.map(
          (o) =>
            `Comercial: ${o.opportunityName} (${o.clientName}) — ${date(
              o.nextFollowUpDate,
            )}.`,
        ),
      ],
      riesgos: [
        ...(finance.overdueExpense.count > 0
          ? [`Hay gastos vencidos por ${money.format(finance.overdueExpense.amount)}.`]
          : []),
      ],
      recomendaciones: [
        'Bloquear tiempo para las tareas críticas y de alta prioridad primero.',
        followUps.length
          ? 'Confirmar los seguimientos comerciales de la semana.'
          : 'Sin seguimientos comerciales agendados; generar oportunidades.',
      ],
      acciones: [
        ...finUpcoming
          .slice(0, 4)
          .map(
            (u) =>
              `${u.kind === 'INCOME' ? 'Cobrar' : 'Pagar'} "${u.description}" (${date(
                u.dueDate,
              )}).`,
          ),
      ],
      faltante: [
        'El plan se basa en fechas registradas; tareas sin fecha no aparecen.',
      ],
    };
    return render(s);
  }

  private async documents(
    orgId: string | null | undefined,
    ctx: ToolContext,
    used: string[],
  ) {
    const docs = (await callReadTool('getDocuments', {}, ctx)) as any[];
    used.push('getDocuments');
    const withoutSummary = docs.filter((d) => !d.aiSummary);

    const s: Section = {
      resumen: [
        `${docs.length} documento(s) registrado(s)${
          orgId ? ' en la empresa filtrada' : ' (consolidado)'
        }. ${withoutSummary.length} sin resumen IA.`,
      ],
      hechos: docs
        .slice(0, 8)
        .map(
          (d) =>
            `${d.title} [${d.documentType}] — ${d.organization?.name ?? '—'}${
              d.project ? ` / ${d.project.name}` : ''
            }${d.aiSummary ? ` · Resumen: ${d.aiSummary}` : ' · sin resumen'}.`,
        ),
      riesgos: withoutSummary.length
        ? [`${withoutSummary.length} documento(s) sin resumen IA para análisis.`]
        : [],
      recomendaciones: [
        'Cargar el archivo y generar resumen IA para los documentos clave (Sprint futuro).',
      ],
      acciones: withoutSummary
        .slice(0, 5)
        .map((d) => `Generar resumen para "${d.title}".`),
      faltante: [
        'La lectura avanzada de archivos (RAG) aún no está disponible; solo se usan metadatos y aiSummary.',
      ],
    };
    return render(s);
  }
}

// Mapea where con organizationId opcional sin sobrescribir otros filtros.
// Sin restringir T se preservan los literales de los enums (evita el widening).
function orgWhere<T>(
  orgId: string | null | undefined,
  rest: T,
): T & { organizationId?: string } {
  return (orgId ? { ...rest, organizationId: orgId } : rest) as T & {
    organizationId?: string;
  };
}

/** Detección simple de intención para chat libre. */
function detectIntent(message: string): QuickIntent | undefined {
  const m = message.toLowerCase();
  if (/healthcare|salud|clínic|médic/.test(m)) return 'healthcare-summary';
  if (/\btech\b|tecnolog|software|alox|matris|vine/.test(m)) return 'tech-summary';
  if (/finanz|ingreso|gasto|resultado|caja|cobr|pag/.test(m))
    return 'financial-analysis';
  if (/venta|comercial|oportunidad|pipeline|seguimiento/.test(m))
    return 'sales-follow-up';
  if (/riesgo|bloque|proyecto/.test(m)) return 'project-risks';
  if (/semana|plan|priori/.test(m)) return 'weekly-plan';
  if (/document/.test(m)) return 'documents-recent';
  return undefined; // resumen ejecutivo consolidado por defecto
}
