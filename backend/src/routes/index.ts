/**
 * Router raíz de la API. Monta los módulos bajo /api.
 * Todos los módulos de negocio requieren autenticación.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authRouter } from '../modules/auth/auth.routes';
import { organizationsRouter } from '../modules/organizations/organizations.routes';
import { businessUnitsRouter } from '../modules/business-units/business-units.routes';
import { projectsRouter } from '../modules/projects/projects.routes';
import { tasksRouter } from '../modules/tasks/tasks.routes';
import { salesRouter } from '../modules/sales/sales.routes';
import { incomeRouter } from '../modules/income/income.routes';
import { expensesRouter } from '../modules/expenses/expenses.routes';
import { financeRouter } from '../modules/finance/finance.routes';
import { financeImportsRouter } from '../modules/finance-imports/finance-imports.routes';
import { financeCategoriesRouter } from '../modules/finance-categories/categories.routes';
import { financeCategoryRulesRouter } from '../modules/finance-categories/category-rules.routes';
import { clientsRouter } from '../modules/clients/clients.routes';
import { vendorsRouter } from '../modules/vendors/vendors.routes';
import { documentsRouter } from '../modules/documents/documents.routes';
import { decisionsRouter } from '../modules/decisions/decisions.routes';
import { agentRouter } from '../modules/agent/agent.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';

export const apiRouter = Router();

// Health check básico (sin autenticación).
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vitamcore-api', time: new Date().toISOString() });
});

// Autenticación.
apiRouter.use('/auth', authRouter);

// Módulos de negocio (protegidos).
apiRouter.use('/organizations', requireAuth, organizationsRouter);
apiRouter.use('/business-units', requireAuth, businessUnitsRouter);
apiRouter.use('/projects', requireAuth, projectsRouter);
apiRouter.use('/tasks', requireAuth, tasksRouter);
apiRouter.use('/sales', requireAuth, salesRouter);
apiRouter.use('/income', requireAuth, incomeRouter);
apiRouter.use('/expenses', requireAuth, expensesRouter);
apiRouter.use('/finance', requireAuth, financeRouter);
apiRouter.use('/finance/imports', requireAuth, financeImportsRouter);
apiRouter.use('/finance/categories', requireAuth, financeCategoriesRouter);
apiRouter.use('/finance/category-rules', requireAuth, financeCategoryRulesRouter);
apiRouter.use('/clients', requireAuth, clientsRouter);
apiRouter.use('/vendors', requireAuth, vendorsRouter);
apiRouter.use('/documents', requireAuth, documentsRouter);
apiRouter.use('/decisions', requireAuth, decisionsRouter);
apiRouter.use('/agent', requireAuth, agentRouter);
apiRouter.use('/dashboard', requireAuth, dashboardRouter);
