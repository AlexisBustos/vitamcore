import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { OrganizationsPage } from '@/pages/organizations/OrganizationsPage';
import { OrganizationDetailPage } from '@/pages/organizations/OrganizationDetailPage';
import { ProjectsPage } from '@/pages/projects/ProjectsPage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { TasksPage } from '@/pages/tasks/TasksPage';
import { SalesPage } from '@/pages/sales/SalesPage';
import { FinancePage } from '@/pages/finance/FinancePage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { DecisionsPage } from '@/pages/decisions/DecisionsPage';
import { AgentPage } from '@/pages/agent/AgentPage';

// Secciones que aún son placeholders profesionales (Sprint 4+).
const placeholders: { path: string; title: string; description: string }[] = [
  { path: '/configuracion', title: 'Configuración', description: 'Parámetros de la plataforma.' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Rutas privadas */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="/empresas" element={<OrganizationsPage />} />
          <Route path="/empresas/:id" element={<OrganizationDetailPage />} />

          <Route path="/proyectos" element={<ProjectsPage />} />
          <Route path="/proyectos/:id" element={<ProjectDetailPage />} />

          <Route path="/tareas" element={<TasksPage />} />
          <Route path="/ventas" element={<SalesPage />} />
          <Route path="/finanzas" element={<FinancePage />} />
          <Route path="/documentos" element={<DocumentsPage />} />
          <Route path="/decisiones" element={<DecisionsPage />} />
          <Route path="/ia" element={<AgentPage />} />

          {placeholders.map((p) => (
            <Route
              key={p.path}
              path={p.path}
              element={
                <PlaceholderPage title={p.title} description={p.description} />
              }
            />
          ))}
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
