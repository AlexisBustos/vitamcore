import type {
  AgentType,
  InsightStatus,
  InsightType,
  ProposedTaskStatus,
} from '@/types/agent';

export const agentTypeLabels: Record<AgentType, string> = {
  EXECUTIVE: 'Ejecutivo',
  FINANCE: 'Finanzas',
  SALES: 'Ventas',
  PROJECT: 'Proyectos',
  DOCUMENT: 'Documentos',
  STRATEGY: 'Estrategia',
  GENERAL: 'General',
};

export const agentTypeOptions = Object.entries(agentTypeLabels).map(
  ([value, label]) => ({ value, label }),
);

export const insightTypeLabels: Record<InsightType, string> = {
  EXECUTIVE_SUMMARY: 'Resumen ejecutivo',
  RISK: 'Riesgo',
  FINANCIAL: 'Financiero',
  SALES: 'Ventas',
  PROJECT: 'Proyecto',
  TASK: 'Tarea',
  DECISION: 'Decisión',
  DOCUMENT: 'Documento',
  STRATEGY: 'Estrategia',
  GENERAL: 'General',
};

export const insightStatus: Record<
  InsightStatus,
  { label: string; className: string }
> = {
  NEW: { label: 'Nuevo', className: 'bg-blue-50 text-blue-700' },
  REVIEWED: { label: 'Revisado', className: 'bg-violet-50 text-violet-700' },
  ACTIONED: { label: 'Accionado', className: 'bg-emerald-50 text-emerald-700' },
  DISMISSED: { label: 'Descartado', className: 'bg-slate-100 text-slate-500' },
};

export const insightStatusOptions = Object.entries(insightStatus).map(
  ([value, { label }]) => ({ value, label }),
);

export const proposedTaskStatus: Record<
  ProposedTaskStatus,
  { label: string; className: string }
> = {
  PROPOSED: { label: 'Propuesta', className: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Aprobada', className: 'bg-blue-50 text-blue-700' },
  REJECTED: { label: 'Rechazada', className: 'bg-slate-100 text-slate-500' },
  CONVERTED_TO_TASK: {
    label: 'Convertida en tarea',
    className: 'bg-emerald-50 text-emerald-700',
  },
};
