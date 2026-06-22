import { NavLink } from 'react-router-dom';
import { navItems } from '@/lib/nav';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] transition-transform md:static md:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-accent)] text-sm font-bold text-white">
          V
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">VITAM CORE</p>
          <p className="text-[11px] text-[var(--color-sidebar-foreground)]">
            Dirección ejecutiva
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--color-sidebar-active)] text-white'
                  : 'text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-active)] hover:text-white',
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 text-[11px] text-[var(--color-sidebar-foreground)]">
        © {new Date().getFullYear()} VITAM
      </div>
    </aside>
  );
}
