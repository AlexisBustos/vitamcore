/**
 * Tipos de dominio: jerarquía organizacional (empresa → unidad → proyecto → tarea)
 * y módulos ejecutivos no financieros (documentos, decisiones estratégicas).
 */

export type OrganizationType = 'HEALTHCARE' | 'TECHNOLOGY' | 'TRANSVERSAL';
export type EntityStatus = 'ACTIVE' | 'INACTIVE';
export type ProjectStatus =
  | 'IDEA'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'PAUSED'
  | 'CANCELLED';
export type TaskStatus = 'TODO' | 'DOING' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskSource =
  | 'MANUAL'
  | 'MEETING'
  | 'EMAIL'
  | 'DOCUMENT'
  | 'AI'
  | 'OTHER';

export interface Ref {
  id: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  type: OrganizationType;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { businessUnits: number; projects: number; tasks: number };
}

export interface OrganizationDetail extends Organization {
  businessUnits: (BusinessUnit & { _count?: { projects: number } })[];
  projects: Project[];
}

export interface BusinessUnit {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: string | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  _count?: { projects: number; tasks: number };
}

export interface Project {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  targetDate: string | null;
  ownerId: string | null;
  owner: Ref | null;
  nextAction: string | null;
  risks: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  businessUnit?: Ref | null;
  _count?: { tasks: number };
  taskStats?: { total: number; done: number }; // avance según tareas (solo en listado)
}

export interface ProjectDetail extends Project {
  tasks: Task[];
}

export interface Task {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  ownerId: string | null;
  owner: Ref | null;
  source: TaskSource;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: Ref;
  businessUnit?: Ref | null;
  project?: Ref | null;
}

export interface ContextRefs {
  organization?: Ref;
  businessUnit?: Ref | null;
  project?: Ref | null;
}

export type DocumentType =
  | 'CONTRACT'
  | 'PROPOSAL'
  | 'QUOTE'
  | 'REPORT'
  | 'MEETING_MINUTES'
  | 'FINANCIAL'
  | 'TECHNICAL'
  | 'LEGAL'
  | 'NORMATIVE'
  | 'OTHER';
export type DocumentStatus =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'DRAFT'
  | 'REVIEW'
  | 'FINAL';

export interface DocumentRecord extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  fileName: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSize: number | null;
  documentType: DocumentType;
  status: DocumentStatus;
  clientName: string | null;
  tags: string[];
  aiSummary: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DecisionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'IMPLEMENTED'
  | 'REVISIT'
  | 'CANCELLED';

export interface StrategicDecision extends ContextRefs {
  id: string;
  organizationId: string;
  businessUnitId: string | null;
  projectId: string | null;
  title: string;
  context: string | null;
  decision: string;
  rationale: string | null;
  risks: string | null;
  nextStep: string | null;
  decisionDate: string | null;
  status: DecisionStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
