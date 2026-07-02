/**
 * Configuración de navegación principal del sidebar.
 * Cada entrada se renderiza como un enlace; las secciones aún no
 * implementadas usan una pantalla placeholder.
 */
import {
  Bot,
  Building2,
  CheckSquare,
  FileText,
  FolderKanban,
  Gavel,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Empresas', path: '/empresas', icon: Building2 },
  { label: 'Proyectos', path: '/proyectos', icon: FolderKanban },
  { label: 'Tareas', path: '/tareas', icon: CheckSquare },
  { label: 'Ventas', path: '/ventas', icon: TrendingUp },
  { label: 'Clientes', path: '/clientes', icon: Users },
  { label: 'Proveedores', path: '/proveedores', icon: Truck },
  { label: 'Finanzas', path: '/finanzas', icon: Wallet },
  { label: 'Documentos', path: '/documentos', icon: FileText },
  { label: 'Decisiones', path: '/decisiones', icon: Gavel },
  { label: 'IA Ejecutiva', path: '/ia', icon: Bot },
  { label: 'Usuarios', path: '/usuarios', icon: UserCog },
  { label: 'Configuración', path: '/configuracion', icon: Settings },
];
