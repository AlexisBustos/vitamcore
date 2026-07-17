/**
 * Tipos del resumen ejecutivo del dashboard.
 * Agrega datos de proyectos, tareas y finanzas.
 */

import type { ProjectStatus, TaskStatus, OrganizationType, Priority, Ref, DocumentType } from './core';
import type { FinanceSummary } from './finance';

export interface DashboardSummary {
  totals: {
    activeProjects: number;
    blockedProjects: number;
    pendingTasks: number;
    overdueTasks: number;
    criticalTasks: number;
    monthIncome: number;
    monthExpense: number;
    weekIncome: number;
    weekExpense: number;
    estimatedResult: number;
    pendingIncome: number;
    pendingExpense: number;
    overdueIncome: number;
    overdueExpense: number;
    activeDecisions: number;
    revisitDecisions: number;
  };
  projectsByStatus: Record<ProjectStatus, number>;
  tasksByStatus: Record<TaskStatus, number>;
  projectsByOrganization: {
    id: string;
    name: string;
    type: OrganizationType;
    total: number;
    active: number;
  }[];
  upcomingDueDates: {
    id: string;
    title: string;
    dueDate: string;
    priority: Priority;
    organization: Ref;
    project: Ref | null;
  }[];
  finance: FinanceSummary;
  recentDocuments: {
    id: string;
    title: string;
    documentType: DocumentType;
    createdAt: string;
    organization: Ref;
  }[];
}
