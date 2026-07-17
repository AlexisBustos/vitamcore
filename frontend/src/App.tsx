import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { RequireAdmin } from '@/routes/RequireAdmin';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { OrganizationsPage } from '@/pages/organizations/OrganizationsPage';
import { OrganizationDetailPage } from '@/pages/organizations/OrganizationDetailPage';
import { ProjectsPage } from '@/pages/projects/ProjectsPage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { TasksPage } from '@/pages/tasks/TasksPage';
import { ClientsPage } from '@/pages/clients/ClientsPage';
import { ClientDetailPage } from '@/pages/clients/ClientDetailPage';
import { VendorsPage } from '@/pages/vendors/VendorsPage';
import { VendorDetailPage } from '@/pages/vendors/VendorDetailPage';
import { FinancePage } from '@/pages/finance/FinancePage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { DecisionsPage } from '@/pages/decisions/DecisionsPage';
import { AgentPage } from '@/pages/agent/AgentPage';
import { UsersPage } from '@/pages/users/UsersPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';

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
        {/* Pantalla de primer ingreso forzado (fuera del layout). */}
        <Route path="/cambiar-clave" element={<ChangePasswordPage />} />
        <Route element={<AppLayout />}>
          {/* Compartidas: admin + colaborador */}
          <Route path="/proyectos" element={<ProjectsPage />} />
          <Route path="/proyectos/:id" element={<ProjectDetailPage />} />
          <Route path="/tareas" element={<TasksPage />} />

          {/* Solo admin (CEO/ADMIN) */}
          <Route element={<RequireAdmin />}>
            <Route index element={<DashboardPage />} />
            <Route path="/empresas" element={<OrganizationsPage />} />
            <Route path="/empresas/:id" element={<OrganizationDetailPage />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
            <Route path="/proveedores" element={<VendorsPage />} />
            <Route path="/proveedores/:id" element={<VendorDetailPage />} />
            <Route path="/finanzas" element={<FinancePage />} />
            <Route path="/documentos" element={<DocumentsPage />} />
            <Route path="/decisiones" element={<DecisionsPage />} />
            <Route path="/ia" element={<AgentPage />} />
            <Route path="/usuarios" element={<UsersPage />} />

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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
