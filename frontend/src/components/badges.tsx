/**
 * Badges de dominio: traducen un valor enum a su etiqueta y color.
 */
import { Badge } from '@/components/ui/badge';
import * as d from '@/lib/domain';
import type {
  DecisionStatus,
  DocumentStatus,
  DocumentType,
  EntityStatus,
  ExpenseStatus,
  IncomeStatus,
  Priority,
  ProjectStatus,
  TaskStatus,
} from '@/types/domain';

export function ProjectStatusBadge({ value }: { value: ProjectStatus }) {
  const t = d.projectStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function TaskStatusBadge({ value }: { value: TaskStatus }) {
  const t = d.taskStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function PriorityBadge({ value }: { value: Priority }) {
  const t = d.priority[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function EntityStatusBadge({ value }: { value: EntityStatus }) {
  const t = d.entityStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function IncomeStatusBadge({ value }: { value: IncomeStatus }) {
  const t = d.incomeStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function ExpenseStatusBadge({ value }: { value: ExpenseStatus }) {
  const t = d.expenseStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function DocumentTypeBadge({ value }: { value: DocumentType }) {
  const t = d.documentType[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function DocumentStatusBadge({ value }: { value: DocumentStatus }) {
  const t = d.documentStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}

export function DecisionStatusBadge({ value }: { value: DecisionStatus }) {
  const t = d.decisionStatus[value];
  return <Badge className={t.className}>{t.label}</Badge>;
}
