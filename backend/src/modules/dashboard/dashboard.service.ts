/**
 * Métricas agregadas para el dashboard ejecutivo.
 * Acepta un filtro opcional por empresa (vista consolidada vs. por empresa).
 */
import type { ProjectStatus, TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getSummary as getFinanceSummary } from '../finance/finance.service';

const PROJECT_STATUSES: ProjectStatus[] = [
  'IDEA',
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'COMPLETED',
  'PAUSED',
  'CANCELLED',
];

const TASK_STATUSES: TaskStatus[] = ['TODO', 'DOING', 'DONE'];

const CLOSED_TASK_STATUSES: TaskStatus[] = ['DONE'];

export async function getSummary(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};
  const now = new Date();

  const [
    activeProjects,
    blockedProjects,
    pendingTasks,
    overdueTasks,
    criticalTasks,
    projectGroups,
    taskGroups,
    organizations,
    upcoming,
  ] = await Promise.all([
    prisma.project.count({ where: { ...orgFilter, status: 'IN_PROGRESS' } }),
    prisma.project.count({ where: { ...orgFilter, status: 'BLOCKED' } }),
    prisma.task.count({ where: { ...orgFilter, status: 'TODO' } }),
    prisma.task.count({
      where: {
        ...orgFilter,
        dueDate: { lt: now },
        status: { notIn: CLOSED_TASK_STATUSES },
      },
    }),
    prisma.task.count({
      where: {
        ...orgFilter,
        priority: 'CRITICAL',
        status: { notIn: CLOSED_TASK_STATUSES },
      },
    }),
    prisma.project.groupBy({
      by: ['status'],
      where: orgFilter,
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: orgFilter,
      _count: { _all: true },
    }),
    prisma.organization.findMany({
      where: organizationId ? { id: organizationId } : {},
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.findMany({
      where: {
        ...orgFilter,
        dueDate: { gte: now },
        status: { notIn: CLOSED_TASK_STATUSES },
      },
      orderBy: { dueDate: 'asc' },
      take: 8,
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Distribución por estado, con todas las claves presentes (incluso en 0).
  const projectsByStatus = fillCounts(PROJECT_STATUSES, projectGroups);
  const tasksByStatus = fillCounts(TASK_STATUSES, taskGroups);

  // Proyectos por empresa (total y activos).
  const projectsByOrganization = await Promise.all(
    organizations.map(async (org) => {
      const [total, active] = await Promise.all([
        prisma.project.count({ where: { organizationId: org.id } }),
        prisma.project.count({
          where: { organizationId: org.id, status: 'IN_PROGRESS' },
        }),
      ]);
      return { id: org.id, name: org.name, type: org.type, total, active };
    }),
  );

  // Métricas ejecutivas del Sprint 2 (finanzas, documentos, decisiones).
  const [finance, recentDocuments, activeDecisions, revisitDecisions] =
    await Promise.all([
      getFinanceSummary(organizationId),
      prisma.document.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          title: true,
          documentType: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),
      prisma.strategicDecision.count({
        where: { ...orgFilter, status: 'ACTIVE' },
      }),
      prisma.strategicDecision.count({
        where: { ...orgFilter, status: 'REVISIT' },
      }),
    ]);

  return {
    totals: {
      activeProjects,
      blockedProjects,
      pendingTasks,
      overdueTasks,
      criticalTasks,
      // Atajos financieros y comerciales para las tarjetas del dashboard.
      monthIncome: finance.monthIncome,
      monthExpense: finance.monthExpense,
      weekIncome: finance.weekIncome,
      weekExpense: finance.weekExpense,
      estimatedResult: finance.estimatedResult,
      pendingIncome: finance.pendingIncome,
      pendingExpense: finance.pendingExpense,
      overdueIncome: finance.overdueIncome.amount,
      overdueExpense: finance.overdueExpense.amount,
      activeDecisions,
      revisitDecisions,
    },
    projectsByStatus,
    tasksByStatus,
    projectsByOrganization,
    upcomingDueDates: upcoming,
    finance,
    recentDocuments,
  };
}

function fillCounts<T extends string>(
  keys: T[],
  groups: Array<{ status: T; _count: { _all: number } }>,
): Record<T, number> {
  const base = Object.fromEntries(keys.map((k) => [k, 0])) as Record<
    T,
    number
  >;
  for (const g of groups) base[g.status] = g._count._all;
  return base;
}
