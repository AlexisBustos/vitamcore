import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CalendarClock,
  CheckSquare,
  FileText,
  FolderKanban,
  Flame,
  Gavel,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric';
import { PriorityBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import {
  formatDate,
  formatMoney,
  isOverdue,
  documentType as documentTypeMap,
  projectStatus as projectStatusMap,
  taskStatus as taskStatusMap,
} from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useDashboard } from '@/hooks/useDashboard';
import { useTasks } from '@/hooks/useTasks';
import { useAuth } from '@/context/AuthContext';
import type { ProjectStatus, TaskStatus } from '@/types/domain';

export function DashboardPage() {
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const { user } = useAuth();
  const { data: organizations } = useOrganizations();
  const { data, isLoading, isError, error } = useDashboard(orgId);

  // Tareas asignadas al usuario que ingresó, sin terminar, por vencimiento.
  const { data: myTasksRaw } = useTasks(
    user?.id ? { assigneeId: user.id } : {},
  );
  const myTasks = useMemo(() => {
    if (!user?.id) return [];
    return (myTasksRaw ?? [])
      .filter((t) => t.status !== 'DONE')
      .sort((a, b) => {
        // Sin fecha al final; el resto por vencimiento ascendente.
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (av === bv) return 0; // ambas sin fecha (Infinity) → evita NaN
        return av - bv;
      })
      .slice(0, 8);
  }, [myTasksRaw, user?.id]);

  const tabs = useMemo(
    () => [
      { id: undefined as string | undefined, label: 'Consolidado' },
      ...(organizations ?? []).map((o) => ({ id: o.id, label: o.name })),
    ],
    [organizations],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
            Dashboard ejecutivo
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Métricas reales de proyectos y tareas
          </p>
        </div>

        <div className="inline-flex flex-wrap rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-1">
          {tabs.map((t) => (
            <button
              key={t.id ?? 'all'}
              onClick={() => setOrgId(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                orgId === t.id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}

      {data && (
        <>
          {/* Métricas principales */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              title="Proyectos activos"
              value={data.totals.activeProjects}
              icon={FolderKanban}
            />
            <StatCard
              title="Proyectos bloqueados"
              value={data.totals.blockedProjects}
              icon={Ban}
              tone={data.totals.blockedProjects > 0 ? 'warning' : 'default'}
            />
            <StatCard
              title="Tareas pendientes"
              value={data.totals.pendingTasks}
              icon={CheckSquare}
            />
            <StatCard
              title="Tareas vencidas"
              value={data.totals.overdueTasks}
              icon={AlertTriangle}
              tone={data.totals.overdueTasks > 0 ? 'danger' : 'default'}
            />
            <StatCard
              title="Tareas críticas"
              value={data.totals.criticalTasks}
              icon={Flame}
              tone={data.totals.criticalTasks > 0 ? 'danger' : 'default'}
            />
          </div>

          {/* Métricas financieras y comerciales */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Ingresos del mes"
              value={formatMoney(data.totals.monthIncome)}
              icon={ArrowUpRight}
              tone="success"
            />
            <MetricCard
              title="Gastos del mes"
              value={formatMoney(data.totals.monthExpense)}
              icon={ArrowDownRight}
              tone="danger"
            />
            <MetricCard
              title="Resultado estimado"
              value={formatMoney(data.totals.estimatedResult)}
              icon={Wallet}
              tone={data.totals.estimatedResult >= 0 ? 'success' : 'danger'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Ventas abiertas"
              value={String(data.totals.openOpportunities)}
              hint={formatMoney(data.totals.openAmount)}
              icon={TrendingUp}
            />
            <MetricCard
              title="Monto ponderado"
              value={formatMoney(data.totals.weightedAmount)}
              icon={Target}
              hint="por probabilidad"
            />
            <MetricCard
              title="Sin seguimiento"
              value={String(data.totals.noFollowUpOpportunities)}
              tone={data.totals.noFollowUpOpportunities > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              title="Decisiones activas"
              value={String(data.totals.activeDecisions)}
              hint={`${data.totals.revisitDecisions} por revisar`}
              icon={Gavel}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Por cobrar"
              value={formatMoney(data.totals.pendingIncome)}
            />
            <MetricCard
              title="Gastos pendientes"
              value={formatMoney(data.totals.pendingExpense)}
            />
            <MetricCard
              title="Ingresos vencidos"
              value={formatMoney(data.totals.overdueIncome)}
              tone={data.totals.overdueIncome > 0 ? 'danger' : 'default'}
            />
            <MetricCard
              title="Gastos vencidos"
              value={formatMoney(data.totals.overdueExpense)}
              tone={data.totals.overdueExpense > 0 ? 'danger' : 'default'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Proyectos por empresa */}
            <Card>
              <CardHeader>
                <CardTitle>Proyectos por empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.projectsByOrganization.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-[var(--color-foreground)]">
                      {o.name}
                    </span>
                    <span className="text-sm text-[var(--color-muted-foreground)]">
                      {o.active} activos / {o.total} total
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Distribución de proyectos por estado */}
            <Card>
              <CardHeader>
                <CardTitle>Proyectos por estado</CardTitle>
              </CardHeader>
              <CardContent>
                <Distribution
                  data={data.projectsByStatus}
                  labels={(k) =>
                    projectStatusMap[k as ProjectStatus].label
                  }
                />
              </CardContent>
            </Card>

            {/* Distribución de tareas por estado */}
            <Card>
              <CardHeader>
                <CardTitle>Tareas por estado</CardTitle>
              </CardHeader>
              <CardContent>
                <Distribution
                  data={data.tasksByStatus}
                  labels={(k) => taskStatusMap[k as TaskStatus].label}
                />
              </CardContent>
            </Card>
          </div>

          {/* Mis tareas pendientes */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
              <CardTitle>Mis tareas</CardTitle>
            </CardHeader>
            <CardContent>
              {myTasks.length === 0 ? (
                <EmptyState title="No tienes tareas pendientes" />
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {myTasks.map((t) => (
                    <Link
                      key={t.id}
                      to={`/tareas?tarea=${t.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-[var(--color-muted)]/40"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--color-foreground)]">
                          {t.title}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {t.organization?.name ?? '—'}
                          {t.project ? ` · ${t.project.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <PriorityBadge value={t.priority} />
                        <span
                          className={
                            isOverdue(t.dueDate)
                              ? 'text-sm text-[var(--color-danger)]'
                              : 'text-sm text-[var(--color-muted-foreground)]'
                          }
                        >
                          {formatDate(t.dueDate)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <div className="pt-3">
                <Link
                  to="/tareas"
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Ver todas
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Próximos vencimientos */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[var(--color-accent)]" />
              <CardTitle>Próximos vencimientos</CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcomingDueDates.length === 0 ? (
                <EmptyState title="Sin vencimientos próximos" />
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {data.upcomingDueDates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--color-foreground)]">
                          {t.title}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {t.organization.name}
                          {t.project ? ` · ${t.project.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <PriorityBadge value={t.priority} />
                        <span className="text-sm text-[var(--color-muted-foreground)]">
                          {formatDate(t.dueDate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Próximos seguimientos comerciales + documentos recientes */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--color-accent)]" />
                <CardTitle>Próximos seguimientos comerciales</CardTitle>
              </CardHeader>
              <CardContent>
                {data.upcomingFollowUps.length === 0 ? (
                  <EmptyState title="Sin seguimientos próximos" />
                ) : (
                  <div className="divide-y divide-[var(--color-border)]">
                    {data.upcomingFollowUps.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--color-foreground)]">
                            {o.opportunityName}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {o.clientName}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-[var(--color-foreground)]">
                            {formatMoney(o.estimatedAmount)}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {formatDate(o.nextFollowUpDate)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--color-accent)]" />
                <CardTitle>Documentos recientes</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentDocuments.length === 0 ? (
                  <EmptyState title="Sin documentos" />
                ) : (
                  <div className="divide-y divide-[var(--color-border)]">
                    {data.recentDocuments.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--color-foreground)]">
                            {d.title}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {d.organization.name} · {documentTypeMap[d.documentType].label}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {formatDate(d.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-right text-xs text-[var(--color-muted-foreground)]">
            <Link to="/ventas" className="hover:text-[var(--color-accent)]">
              Ventas
            </Link>
            {' · '}
            <Link to="/finanzas" className="hover:text-[var(--color-accent)]">
              Finanzas
            </Link>
            {' · '}
            <Link to="/proyectos" className="hover:text-[var(--color-accent)]">
              Proyectos
            </Link>
            {' · '}
            <Link to="/tareas" className="hover:text-[var(--color-accent)]">
              Tareas
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone?: 'default' | 'warning' | 'danger';
}

function StatCard({ title, value, icon: Icon, tone = 'default' }: StatCardProps) {
  const toneColor =
    tone === 'danger'
      ? 'text-[var(--color-danger)]'
      : tone === 'warning'
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-muted-foreground)]';

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {title}
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--color-foreground)]">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-muted)]">
          <Icon className={cn('h-5 w-5', toneColor)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Distribution({
  data,
  labels,
}: {
  data: Record<string, number>;
  labels: (key: string) => string;
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);

  if (total === 0) {
    return (
      <p className="py-4 text-sm text-[var(--color-muted-foreground)]">
        Sin datos.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-foreground)]">
              {labels(key)}
            </span>
            <span className="text-[var(--color-muted-foreground)]">
              {value}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{ width: `${(value / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
