/**
 * Seed de VITAM CORE.
 * Crea (idempotente):
 *  - usuario CEO inicial
 *  - configuración mínima
 *  - empresas (Vitam Healthcare, Vitam Tech)
 *  - unidades de negocio iniciales
 *  - proyectos iniciales
 *  - tareas de ejemplo asociadas a proyectos
 *
 * Ejecutar con: npm run prisma:seed
 */
import {
  PrismaClient,
  Role,
  OrganizationType,
  ProjectStatus,
  Priority,
  TaskStatus,
  TaskSource,
  SalesStatus,
  SalesSource,
  IncomeStatus,
  ExpenseStatus,
  DocumentType,
  DocumentStatus,
  DecisionStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const CEO_NAME = process.env.SEED_CEO_NAME ?? 'CEO VITAM';
const CEO_EMAIL = process.env.SEED_CEO_EMAIL ?? 'ceo@vitam.tech';
const CEO_PASSWORD = process.env.SEED_CEO_PASSWORD ?? 'VitamCore2026!';

/** Fecha relativa a hoy, en días (negativo = pasado). */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function seedUserAndConfig() {
  const passwordHash = await bcrypt.hash(CEO_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: CEO_EMAIL },
    update: { name: CEO_NAME, role: Role.CEO, isActive: true },
    create: {
      name: CEO_NAME,
      email: CEO_EMAIL,
      passwordHash,
      role: Role.CEO,
      isActive: true,
    },
  });

  const config = [
    { key: 'app.name', value: 'VITAM CORE' },
    { key: 'app.version', value: '0.2.0' },
    { key: 'companies', value: 'Vitam Healthcare,Vitam Tech' },
  ];
  for (const item of config) {
    await prisma.appConfig.upsert({
      where: { key: item.key },
      update: { value: item.value },
      create: item,
    });
  }
}

async function seedOrganization(
  name: string,
  type: OrganizationType,
  description: string,
) {
  return prisma.organization.upsert({
    where: { name },
    update: { type, description },
    create: { name, type, description },
  });
}

async function seedUnit(organizationId: string, name: string) {
  return prisma.businessUnit.upsert({
    where: { organizationId_name: { organizationId, name } },
    update: {},
    create: { organizationId, name },
  });
}

interface ProjectSeed {
  name: string;
  unit: string;
  status: ProjectStatus;
  priority: Priority;
  owner?: string;
  nextAction?: string;
  risks?: string;
  startDate?: Date;
  targetDate?: Date;
}

async function seedProject(
  organizationId: string,
  unitIds: Record<string, string>,
  p: ProjectSeed,
) {
  return prisma.project.upsert({
    where: { organizationId_name: { organizationId, name: p.name } },
    update: {
      status: p.status,
      priority: p.priority,
      businessUnitId: unitIds[p.unit] ?? null,
    },
    create: {
      organizationId,
      businessUnitId: unitIds[p.unit] ?? null,
      name: p.name,
      status: p.status,
      priority: p.priority,
      owner: p.owner,
      nextAction: p.nextAction,
      risks: p.risks,
      startDate: p.startDate,
      targetDate: p.targetDate,
    },
  });
}

async function main() {
  await seedUserAndConfig();

  // --- Empresas ---
  const healthcare = await seedOrganization(
    'Vitam Healthcare',
    OrganizationType.HEALTHCARE,
    'Centro médico, servicios clínicos, salud ocupacional, operativos de salud, programas preventivos y convenios.',
  );
  const tech = await seedOrganization(
    'Vitam Tech',
    OrganizationType.TECHNOLOGY,
    'Desarrollo de software, inteligencia artificial, productos digitales, infraestructura, soporte y plataformas B2B.',
  );

  // --- Unidades de negocio ---
  const healthcareUnits = [
    'Centro Médico',
    'Salud Ocupacional',
    'Operativos Empresas',
    'Programas Preventivos',
    'Convenios',
  ];
  const techUnits = [
    'Desarrollo Software',
    'Productos SaaS',
    'IA y Agentes',
    'Infraestructura',
    'Comercial Tech',
    'Soporte',
  ];

  const hUnitIds: Record<string, string> = {};
  for (const name of healthcareUnits) {
    const u = await seedUnit(healthcare.id, name);
    hUnitIds[name] = u.id;
  }
  const tUnitIds: Record<string, string> = {};
  for (const name of techUnits) {
    const u = await seedUnit(tech.id, name);
    tUnitIds[name] = u.id;
  }

  // --- Proyectos ---
  const healthcareProjects: ProjectSeed[] = [
    {
      name: 'Centro Médico Casablanca',
      unit: 'Centro Médico',
      status: ProjectStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      owner: 'Dirección Healthcare',
      nextAction: 'Cerrar habilitación sanitaria del recinto.',
      risks: 'Plazos de habilitación municipal.',
      startDate: daysFromNow(-60),
      targetDate: daysFromNow(45),
    },
    {
      name: 'Salud Ocupacional Weir',
      unit: 'Salud Ocupacional',
      status: ProjectStatus.IN_PROGRESS,
      priority: Priority.MEDIUM,
      owner: 'Coordinación SO',
      nextAction: 'Agendar exámenes preocupacionales de julio.',
      startDate: daysFromNow(-30),
      targetDate: daysFromNow(20),
    },
    {
      name: 'Operativo Cardiometabólico Empresas',
      unit: 'Operativos Empresas',
      status: ProjectStatus.PLANNED,
      priority: Priority.MEDIUM,
      owner: 'Operativos',
      nextAction: 'Definir empresas objetivo del operativo.',
      targetDate: daysFromNow(60),
    },
  ];

  const techProjects: ProjectSeed[] = [
    {
      name: 'Alox',
      unit: 'Productos SaaS',
      status: ProjectStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      owner: 'Equipo Producto',
      nextAction: 'Cerrar onboarding del primer cliente B2B.',
      startDate: daysFromNow(-90),
      targetDate: daysFromNow(30),
    },
    {
      name: 'Vine',
      unit: 'Productos SaaS',
      status: ProjectStatus.IN_REVIEW,
      priority: Priority.MEDIUM,
      owner: 'Equipo Producto',
      nextAction: 'Revisión de UX con stakeholders.',
    },
    {
      name: 'Matris SHE',
      unit: 'Productos SaaS',
      status: ProjectStatus.IN_PROGRESS,
      priority: Priority.CRITICAL,
      owner: 'Equipo SHE',
      nextAction: 'Definir roadmap del próximo trimestre.',
      risks: 'Dependencia de integración con clientes industriales.',
      targetDate: daysFromNow(15),
    },
    {
      name: 'Savi',
      unit: 'Productos SaaS',
      status: ProjectStatus.PLANNED,
      priority: Priority.MEDIUM,
      owner: 'Equipo Producto',
    },
    {
      name: 'Vitam Check',
      unit: 'Productos SaaS',
      status: ProjectStatus.IDEA,
      priority: Priority.LOW,
    },
    {
      name: 'Vitam Consent',
      unit: 'Productos SaaS',
      status: ProjectStatus.BLOCKED,
      priority: Priority.HIGH,
      owner: 'Legal + Producto',
      risks: 'Definiciones legales de consentimiento pendientes.',
      nextAction: 'Reunión con asesoría legal.',
    },
    {
      name: 'VITAM CORE',
      unit: 'Desarrollo Software',
      status: ProjectStatus.IN_PROGRESS,
      priority: Priority.CRITICAL,
      owner: 'CEO',
      nextAction: 'Completar módulos del Sprint 1.',
      startDate: daysFromNow(-14),
      targetDate: daysFromNow(30),
    },
    {
      name: 'Interoperabilidad Valparaíso',
      unit: 'Infraestructura',
      status: ProjectStatus.PLANNED,
      priority: Priority.HIGH,
      owner: 'Infraestructura',
      nextAction: 'Definir estándares de interoperabilidad (HL7/FHIR).',
      targetDate: daysFromNow(90),
    },
  ];

  const projectIds: Record<string, string> = {};
  for (const p of healthcareProjects) {
    const created = await seedProject(healthcare.id, hUnitIds, p);
    projectIds[p.name] = created.id;
  }
  for (const p of techProjects) {
    const created = await seedProject(tech.id, tUnitIds, p);
    projectIds[p.name] = created.id;
  }

  // --- Tareas de ejemplo (solo si aún no hay tareas) ---
  const existingTasks = await prisma.task.count();
  if (existingTasks === 0) {
    await prisma.task.createMany({
      data: [
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Desarrollo Software'],
          projectId: projectIds['VITAM CORE'],
          title: 'Implementar CRUD de proyectos y tareas',
          status: TaskStatus.DOING,
          priority: Priority.CRITICAL,
          source: TaskSource.MANUAL,
          owner: 'CEO',
          dueDate: daysFromNow(3),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Matris SHE'],
          title: 'Definir roadmap trimestral de Matris SHE',
          status: TaskStatus.TODO,
          priority: Priority.HIGH,
          source: TaskSource.MEETING,
          dueDate: daysFromNow(7),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Vitam Consent'],
          title: 'Reunión con asesoría legal por consentimiento',
          status: TaskStatus.DOING,
          priority: Priority.HIGH,
          source: TaskSource.EMAIL,
          dueDate: daysFromNow(-2),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Alox'],
          title: 'Cerrar onboarding del primer cliente B2B',
          status: TaskStatus.DOING,
          priority: Priority.HIGH,
          source: TaskSource.MANUAL,
          dueDate: daysFromNow(5),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Centro Médico'],
          projectId: projectIds['Centro Médico Casablanca'],
          title: 'Cerrar habilitación sanitaria del recinto',
          status: TaskStatus.TODO,
          priority: Priority.CRITICAL,
          source: TaskSource.MANUAL,
          dueDate: daysFromNow(-1),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Salud Ocupacional'],
          projectId: projectIds['Salud Ocupacional Weir'],
          title: 'Agendar exámenes preocupacionales de julio',
          status: TaskStatus.TODO,
          priority: Priority.MEDIUM,
          source: TaskSource.MANUAL,
          dueDate: daysFromNow(10),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Operativos Empresas'],
          projectId: projectIds['Operativo Cardiometabólico Empresas'],
          title: 'Definir empresas objetivo del operativo',
          status: TaskStatus.TODO,
          priority: Priority.MEDIUM,
          source: TaskSource.MEETING,
          dueDate: daysFromNow(14),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Infraestructura'],
          projectId: projectIds['Interoperabilidad Valparaíso'],
          title: 'Investigar estándares HL7/FHIR',
          status: TaskStatus.TODO,
          priority: Priority.MEDIUM,
          source: TaskSource.DOCUMENT,
          dueDate: daysFromNow(21),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Desarrollo Software'],
          projectId: projectIds['VITAM CORE'],
          title: 'Preparar despliegue de entorno de staging',
          status: TaskStatus.DONE,
          priority: Priority.MEDIUM,
          source: TaskSource.MANUAL,
          dueDate: daysFromNow(-5),
        },
      ],
    });
  }

  // ===== Sprint 2: ventas, finanzas, documentos, decisiones =====

  // --- Oportunidades comerciales ---
  if ((await prisma.salesOpportunity.count()) === 0) {
    await prisma.salesOpportunity.createMany({
      data: [
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Operativos Empresas'],
          projectId: projectIds['Operativo Cardiometabólico Empresas'],
          clientName: 'Empresa Minera Regional',
          contactName: 'Gerente de Personas',
          opportunityName: 'Operativo Cardiometabólico Empresas',
          productOrService: 'Operativo de salud',
          estimatedAmount: 18000000,
          probability: 60,
          status: SalesStatus.PROPOSAL_SENT,
          source: SalesSource.MEETING,
          nextAction: 'Enviar propuesta ajustada con dotación final.',
          nextFollowUpDate: daysFromNow(4),
          expectedCloseDate: daysFromNow(25),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Alox'],
          clientName: 'Mutual de Seguridad',
          contactName: 'Jefe de Innovación',
          opportunityName: 'Alox para Mutual',
          productOrService: 'Licencia Alox',
          estimatedAmount: 32000000,
          probability: 50,
          status: SalesStatus.NEGOTIATION,
          source: SalesSource.REFERRAL,
          nextAction: 'Reunión de cierre comercial.',
          nextFollowUpDate: daysFromNow(2),
          expectedCloseDate: daysFromNow(20),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Matris SHE'],
          clientName: 'Weir Minerals',
          opportunityName: 'Matris SHE para Weir',
          productOrService: 'Matris SHE',
          estimatedAmount: 24000000,
          probability: 70,
          status: SalesStatus.DIAGNOSIS_DONE,
          source: SalesSource.EXISTING_CLIENT,
          nextAction: 'Presentar resultados del diagnóstico.',
          nextFollowUpDate: daysFromNow(6),
          expectedCloseDate: daysFromNow(30),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Convenios'],
          clientName: 'Municipalidad de Casablanca',
          opportunityName: 'Convenios Empresa Casablanca',
          productOrService: 'Convenio de atención',
          estimatedAmount: 9000000,
          probability: 40,
          status: SalesStatus.CONTACTED,
          source: SalesSource.MANUAL,
          nextAction: 'Agendar reunión con dirección municipal.',
          // Sin próxima fecha de seguimiento (aparece como "sin seguimiento").
          expectedCloseDate: daysFromNow(45),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Comercial Tech'],
          clientName: 'Empresas Regionales (paquete)',
          opportunityName: 'Alox + Vine + Matris para empresas regionales',
          productOrService: 'Paquete plataformas',
          estimatedAmount: 48000000,
          probability: 35,
          status: SalesStatus.LEAD,
          source: SalesSource.LINKEDIN,
          nextAction: 'Calificar lead y detectar decisor.',
          nextFollowUpDate: daysFromNow(9),
          expectedCloseDate: daysFromNow(60),
        },
      ],
    });
  }

  // --- Ingresos ---
  if ((await prisma.incomeRecord.count()) === 0) {
    await prisma.incomeRecord.createMany({
      data: [
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Centro Médico'],
          clientName: 'Pacientes particulares',
          description: 'Consultas médicas del mes',
          amount: 6500000,
          category: 'Consulta médica',
          status: IncomeStatus.PAID,
          incomeDate: daysFromNow(-6),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Salud Ocupacional'],
          projectId: projectIds['Salud Ocupacional Weir'],
          clientName: 'Weir Minerals',
          description: 'Exámenes preocupacionales',
          amount: 4200000,
          category: 'Salud ocupacional',
          status: IncomeStatus.INVOICED,
          incomeDate: daysFromNow(-2),
          dueDate: daysFromNow(15),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Convenios'],
          description: 'Convenio atención empresas',
          amount: 3000000,
          category: 'Convenio',
          status: IncomeStatus.EXPECTED,
          dueDate: daysFromNow(-3),
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Alox'],
          clientName: 'Cliente B2B Alox',
          description: 'Suscripción mensual Alox',
          amount: 2500000,
          category: 'Suscripción',
          status: IncomeStatus.PAID,
          incomeDate: daysFromNow(-10),
          isRecurring: true,
          recurrenceFrequency: 'MONTHLY',
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Desarrollo Software'],
          description: 'Desarrollo a medida',
          amount: 8000000,
          category: 'Desarrollo a medida',
          status: IncomeStatus.INVOICED,
          incomeDate: daysFromNow(-4),
          dueDate: daysFromNow(20),
        },
      ],
    });
  }

  // --- Gastos ---
  if ((await prisma.expenseRecord.count()) === 0) {
    await prisma.expenseRecord.createMany({
      data: [
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Centro Médico'],
          vendorName: 'Equipo médico externo',
          description: 'Honorarios clínicos del mes',
          amount: 3800000,
          category: 'Honorarios clínicos',
          status: ExpenseStatus.PAID,
          expenseDate: daysFromNow(-5),
        },
        {
          organizationId: healthcare.id,
          vendorName: 'Inmobiliaria Casablanca',
          description: 'Arriendo recinto',
          amount: 1800000,
          category: 'Arriendo',
          status: ExpenseStatus.PENDING,
          expenseDate: daysFromNow(-1),
          dueDate: daysFromNow(5),
          isRecurring: true,
          recurrenceFrequency: 'MONTHLY',
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Infraestructura'],
          vendorName: 'Proveedor Cloud',
          description: 'Infraestructura y hosting',
          amount: 1200000,
          category: 'Infraestructura',
          status: ExpenseStatus.PAID,
          expenseDate: daysFromNow(-8),
          isRecurring: true,
          recurrenceFrequency: 'MONTHLY',
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['IA y Agentes'],
          vendorName: 'Proveedor LLM/API',
          description: 'Consumo de APIs de IA',
          amount: 600000,
          category: 'IA/API',
          status: ExpenseStatus.OVERDUE,
          expenseDate: daysFromNow(-12),
          dueDate: daysFromNow(-2),
        },
        {
          organizationId: tech.id,
          vendorName: 'Agencia',
          description: 'Marketing tech trimestral',
          amount: 2000000,
          category: 'Marketing tech',
          status: ExpenseStatus.PENDING,
          dueDate: daysFromNow(10),
        },
      ],
    });
  }

  // --- Documentos (metadatos; archivo físico a futuro en S3/R2) ---
  if ((await prisma.document.count()) === 0) {
    await prisma.document.createMany({
      data: [
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Alox'],
          title: 'Propuesta Alox para Mutual',
          documentType: DocumentType.PROPOSAL,
          status: DocumentStatus.FINAL,
          clientName: 'Mutual de Seguridad',
          tags: ['ventas', 'alox', 'mutual'],
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Convenios'],
          title: 'Borrador convenio Casablanca',
          documentType: DocumentType.CONTRACT,
          status: DocumentStatus.DRAFT,
          clientName: 'Municipalidad de Casablanca',
          tags: ['convenio', 'legal'],
        },
        {
          organizationId: tech.id,
          businessUnitId: tUnitIds['Productos SaaS'],
          projectId: projectIds['Matris SHE'],
          title: 'Informe de diagnóstico Weir',
          documentType: DocumentType.REPORT,
          status: DocumentStatus.ACTIVE,
          clientName: 'Weir Minerals',
          tags: ['matris', 'diagnostico'],
          aiSummary:
            'Diagnóstico identifica 3 brechas SHE priorizadas; recomienda piloto de 90 días.',
        },
      ],
    });
  }

  // --- Decisiones estratégicas ---
  if ((await prisma.strategicDecision.count()) === 0) {
    await prisma.strategicDecision.createMany({
      data: [
        {
          organizationId: tech.id,
          projectId: projectIds['Matris SHE'],
          title: 'Priorizar Matris SHE en el trimestre',
          context: 'Demanda creciente de clientes industriales.',
          decision: 'Enfocar el roadmap del trimestre en Matris SHE.',
          rationale: 'Mayor potencial de ingresos B2B a corto plazo.',
          nextStep: 'Definir hitos del roadmap con el equipo.',
          status: DecisionStatus.ACTIVE,
          decisionDate: daysFromNow(-7),
        },
        {
          organizationId: healthcare.id,
          businessUnitId: hUnitIds['Centro Médico'],
          projectId: projectIds['Centro Médico Casablanca'],
          title: 'Habilitación del centro médico de Casablanca',
          context: 'Plazos de habilitación sanitaria ajustados.',
          decision: 'Acelerar la habilitación antes de la apertura comercial.',
          risks: 'Riesgo de demoras municipales.',
          nextStep: 'Revisar avance semanal con el equipo legal.',
          status: DecisionStatus.REVISIT,
          decisionDate: daysFromNow(-14),
        },
        {
          organizationId: tech.id,
          title: 'Construir VITAM CORE como plataforma interna',
          context: 'Necesidad de centralizar la gestión ejecutiva.',
          decision: 'Desarrollar VITAM CORE por sprints incrementales.',
          rationale: 'Visión consolidada de ambas empresas.',
          status: DecisionStatus.IMPLEMENTED,
          decisionDate: daysFromNow(-21),
        },
      ],
    });
  }

  const [orgs, units, projects, tasks, sales, income, expenses, docs, decisions] =
    await Promise.all([
      prisma.organization.count(),
      prisma.businessUnit.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.salesOpportunity.count(),
      prisma.incomeRecord.count(),
      prisma.expenseRecord.count(),
      prisma.document.count(),
      prisma.strategicDecision.count(),
    ]);

  console.log('Seed completado.');
  console.log(`  Usuario CEO: ${CEO_EMAIL} / ${CEO_PASSWORD}`);
  console.log(`  Empresas: ${orgs} | Unidades: ${units} | Proyectos: ${projects} | Tareas: ${tasks}`);
  console.log(`  Ventas: ${sales} | Ingresos: ${income} | Gastos: ${expenses} | Documentos: ${docs} | Decisiones: ${decisions}`);
}

main()
  .catch((err) => {
    console.error('Error en el seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
