/**
 * Router raíz de la API. Monta los módulos bajo /api.
 * Todos los módulos de negocio requieren autenticación.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole, allowRoles } from '../middleware/authorize';
import { ADMIN_ROLES, ALL_ROLES } from '../modules/shared/roles';
import { authRouter } from '../modules/auth/auth.routes';
import { organizationsRouter } from '../modules/organizations/organizations.routes';
import { businessUnitsRouter } from '../modules/business-units/business-units.routes';
import { projectsRouter } from '../modules/projects/projects.routes';
import { tasksRouter } from '../modules/tasks/tasks.routes';
import { assigneesRouter } from '../modules/assignees/assignees.routes';
import { labelsRouter } from '../modules/labels/labels.routes';
import { salesRouter } from '../modules/sales/sales.routes';
import { incomeRouter } from '../modules/income/income.routes';
import { expensesRouter } from '../modules/expenses/expenses.routes';
import { financeRouter } from '../modules/finance/finance.routes';
import { financeImportsRouter } from '../modules/finance-imports/finance-imports.routes';
import { financeExportRouter } from '../modules/finance-export/finance-export.routes';
import { financeCategoriesRouter } from '../modules/finance-categories/categories.routes';
import { financeCategoryRulesRouter } from '../modules/finance-categories/category-rules.routes';
import { clientsRouter } from '../modules/clients/clients.routes';
import { vendorsRouter } from '../modules/vendors/vendors.routes';
import { documentsRouter } from '../modules/documents/documents.routes';
import { decisionsRouter } from '../modules/decisions/decisions.routes';
import { agentRouter } from '../modules/agent/agent.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { usersRouter } from '../modules/users/users.routes';
import { reportsRouter } from '../modules/reports/reports.routes';

export const apiRouter = Router();

// Health check básico (sin autenticación).
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vitamcore-api', time: new Date().toISOString() });
});

// Autenticación.
apiRouter.use('/auth', authRouter);

// Compartidas (admin + colaborador): acceso total a Proyectos y Tareas.
apiRouter.use('/projects', requireAuth, requireRole(...ALL_ROLES), projectsRouter);
apiRouter.use('/tasks', requireAuth, requireRole(...ALL_ROLES), tasksRouter);
// Personas asignables como responsable: solo lectura, todos los roles.
apiRouter.use('/assignees', requireAuth, requireRole(...ALL_ROLES), assigneesRouter);
// Etiquetas de tareas (por empresa): todos los roles.
apiRouter.use('/labels', requireAuth, requireRole(...ALL_ROLES), labelsRouter);

// Datos de referencia: colaborador puede LEER (para selectores), no escribir.
const referenceAccess = allowRoles({ read: ALL_ROLES, write: ADMIN_ROLES });
apiRouter.use('/organizations', requireAuth, referenceAccess, organizationsRouter);
apiRouter.use('/business-units', requireAuth, referenceAccess, businessUnitsRouter);

// Solo admin (CEO/ADMIN): todo lo demás.
const adminOnly = requireRole(...ADMIN_ROLES);
apiRouter.use('/sales', requireAuth, adminOnly, salesRouter);
apiRouter.use('/income', requireAuth, adminOnly, incomeRouter);
apiRouter.use('/expenses', requireAuth, adminOnly, expensesRouter);
apiRouter.use('/finance', requireAuth, adminOnly, financeRouter);
apiRouter.use('/finance/export', requireAuth, adminOnly, financeExportRouter);
apiRouter.use('/finance/imports', requireAuth, adminOnly, financeImportsRouter);
apiRouter.use('/finance/categories', requireAuth, adminOnly, financeCategoriesRouter);
apiRouter.use('/finance/category-rules', requireAuth, adminOnly, financeCategoryRulesRouter);
apiRouter.use('/clients', requireAuth, adminOnly, clientsRouter);
apiRouter.use('/vendors', requireAuth, adminOnly, vendorsRouter);
apiRouter.use('/documents', requireAuth, adminOnly, documentsRouter);
apiRouter.use('/decisions', requireAuth, adminOnly, decisionsRouter);
apiRouter.use('/agent', requireAuth, adminOnly, agentRouter);
apiRouter.use('/dashboard', requireAuth, adminOnly, dashboardRouter);
apiRouter.use('/users', requireAuth, adminOnly, usersRouter);
apiRouter.use('/reports', requireAuth, adminOnly, reportsRouter);
