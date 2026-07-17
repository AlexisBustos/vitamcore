/**
 * Etiquetas en español y estilos de color para los enums del dominio.
 * Centraliza la presentación para mantener consistencia visual.
 */
import type {
  BankCategoryKind,
  DecisionStatus,
  DocumentStatus,
  DocumentType,
  EntityStatus,
  ExpenseStatus,
  IncomeStatus,
  OrganizationType,
  Priority,
  ProjectStatus,
  RecurrenceFrequency,
  TaskSource,
  TaskStatus,
} from '@/types/domain';

type Tone = {
  label: string;
  className: string; // clases tailwind para Badge
};

export const organizationTypeLabels: Record<OrganizationType, string> = {
  HEALTHCARE: 'Salud',
  TECHNOLOGY: 'Tecnología',
  TRANSVERSAL: 'Transversal',
};

export const entityStatus: Record<EntityStatus, Tone> = {
  ACTIVE: { label: 'Activa', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactiva', className: 'bg-slate-100 text-slate-600' },
};

export const projectStatus: Record<ProjectStatus, Tone> = {
  IDEA: { label: 'Idea', className: 'bg-slate-100 text-slate-600' },
  PLANNED: { label: 'Planificado', className: 'bg-sky-50 text-sky-700' },
  IN_PROGRESS: { label: 'En curso', className: 'bg-blue-50 text-blue-700' },
  BLOCKED: { label: 'Bloqueado', className: 'bg-red-50 text-red-700' },
  IN_REVIEW: { label: 'En revisión', className: 'bg-violet-50 text-violet-700' },
  COMPLETED: { label: 'Completado', className: 'bg-emerald-50 text-emerald-700' },
  PAUSED: { label: 'Pausado', className: 'bg-amber-50 text-amber-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500' },
};

export const taskStatus: Record<TaskStatus, Tone> = {
  TODO: { label: 'Por hacer', className: 'bg-slate-100 text-slate-600' },
  DOING: { label: 'Haciendo', className: 'bg-blue-50 text-blue-700' },
  DONE: { label: 'Hecho', className: 'bg-emerald-50 text-emerald-700' },
};

export const priority: Record<Priority, Tone> = {
  LOW: { label: 'Baja', className: 'bg-slate-100 text-slate-600' },
  MEDIUM: { label: 'Media', className: 'bg-sky-50 text-sky-700' },
  HIGH: { label: 'Alta', className: 'bg-amber-50 text-amber-700' },
  CRITICAL: { label: 'Crítica', className: 'bg-red-50 text-red-700' },
};

export const taskSourceLabels: Record<TaskSource, string> = {
  MANUAL: 'Manual',
  MEETING: 'Reunión',
  EMAIL: 'Email',
  DOCUMENT: 'Documento',
  AI: 'IA',
  OTHER: 'Otro',
};

// ---- Sprint 2 ----

export const incomeStatus: Record<IncomeStatus, Tone> = {
  EXPECTED: { label: 'Esperado', className: 'bg-slate-100 text-slate-600' },
  INVOICED: { label: 'Facturado', className: 'bg-sky-50 text-sky-700' },
  PAID: { label: 'Pagado', className: 'bg-emerald-50 text-emerald-700' },
  OVERDUE: { label: 'Vencido', className: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500' },
};

export const expenseStatus: Record<ExpenseStatus, Tone> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Pagado', className: 'bg-emerald-50 text-emerald-700' },
  OVERDUE: { label: 'Vencido', className: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500' },
};

export const documentType: Record<DocumentType, Tone> = {
  CONTRACT: { label: 'Contrato', className: 'bg-blue-50 text-blue-700' },
  PROPOSAL: { label: 'Propuesta', className: 'bg-violet-50 text-violet-700' },
  QUOTE: { label: 'Cotización', className: 'bg-sky-50 text-sky-700' },
  REPORT: { label: 'Informe', className: 'bg-indigo-50 text-indigo-700' },
  MEETING_MINUTES: { label: 'Acta', className: 'bg-slate-100 text-slate-600' },
  FINANCIAL: { label: 'Financiero', className: 'bg-emerald-50 text-emerald-700' },
  TECHNICAL: { label: 'Técnico', className: 'bg-cyan-50 text-cyan-700' },
  LEGAL: { label: 'Legal', className: 'bg-amber-50 text-amber-700' },
  NORMATIVE: { label: 'Normativo', className: 'bg-rose-50 text-rose-700' },
  OTHER: { label: 'Otro', className: 'bg-slate-100 text-slate-600' },
};

export const documentStatus: Record<DocumentStatus, Tone> = {
  ACTIVE: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700' },
  ARCHIVED: { label: 'Archivado', className: 'bg-slate-100 text-slate-500' },
  DRAFT: { label: 'Borrador', className: 'bg-slate-100 text-slate-600' },
  REVIEW: { label: 'En revisión', className: 'bg-amber-50 text-amber-700' },
  FINAL: { label: 'Final', className: 'bg-blue-50 text-blue-700' },
};

export const decisionStatus: Record<DecisionStatus, Tone> = {
  DRAFT: { label: 'Borrador', className: 'bg-slate-100 text-slate-600' },
  ACTIVE: { label: 'Activa', className: 'bg-blue-50 text-blue-700' },
  IMPLEMENTED: { label: 'Implementada', className: 'bg-emerald-50 text-emerald-700' },
  REVISIT: { label: 'Revisar', className: 'bg-amber-50 text-amber-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-slate-100 text-slate-500' },
};

export const recurrenceLabels: Record<RecurrenceFrequency, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
};

// ---- Categorías de movimientos bancarios ----
// La presentación de categorías vive ahora en BD (ver useBankCategories); aquí
// solo queda el color por tipo (kind) para el punto indicador en la tabla.

// Color sólido por tipo, pensado para el punto de la celda (visible en 2×2).
const bankKindColor: Record<BankCategoryKind, string> = {
  INCOME: 'bg-emerald-500',
  EXPENSE: 'bg-red-500',
  NEUTRAL: 'bg-slate-400',
};

/** Clase de color (bg) según el tipo de la categoría (kind). */
export function bankKindClassName(kind: BankCategoryKind | undefined): string {
  return kind ? bankKindColor[kind] : bankKindColor.NEUTRAL;
}

// Opciones listas para selects (value + label).
export const projectStatusOptions = toOptions(projectStatus);
export const taskStatusOptions = toOptions(taskStatus);
export const priorityOptions = toOptions(priority);
export const entityStatusOptions = toOptions(entityStatus);
export const organizationTypeOptions = Object.entries(
  organizationTypeLabels,
).map(([value, label]) => ({ value, label }));
export const taskSourceOptions = Object.entries(taskSourceLabels).map(
  ([value, label]) => ({ value, label }),
);

// ---- Sprint 2 ----
export const incomeStatusOptions = toOptions(incomeStatus);
export const expenseStatusOptions = toOptions(expenseStatus);
export const documentTypeOptions = toOptions(documentType);
export const documentStatusOptions = toOptions(documentStatus);
export const decisionStatusOptions = toOptions(decisionStatus);
export const recurrenceOptions = Object.entries(recurrenceLabels).map(
  ([value, label]) => ({ value, label }),
);

function toOptions(map: Record<string, Tone>) {
  return Object.entries(map).map(([value, { label }]) => ({ value, label }));
}

const currencyFmt = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** Formatea un monto entero como moneda (CLP por defecto). */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return currencyFmt.format(value);
}

/** Formatea una fecha ISO a formato local corto, o '—'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** ¿La fecha está vencida (anterior a hoy)? */
export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}
