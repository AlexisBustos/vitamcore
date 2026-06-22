import { useState } from 'react';
import { FileBarChart, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { AgentContent } from '@/components/AgentContent';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { formatDate } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useGenerateReport, useReports } from '@/hooks/useAgent';

export function ReportsPanel() {
  const [orgId, setOrgId] = useState<string | undefined>();
  const [reportType, setReportType] = useState('CONSOLIDATED');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useReports(
    orgId ? { organizationId: orgId } : {},
  );
  const generate = useGenerateReport();

  async function handleGenerate() {
    await generate.mutateAsync({
      reportType: orgId ? 'ORGANIZATION_SPECIFIC' : reportType,
      organizationId: orgId ?? null,
      generate: true,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-md">
            <OrganizationFilter
              value={orgId}
              onChange={(v) => setOrgId(v || undefined)}
            />
            <Select
              options={[
                { value: 'CONSOLIDATED', label: 'Consolidado' },
                { value: 'DAILY', label: 'Diario' },
                { value: 'WEEKLY', label: 'Semanal' },
                { value: 'MONTHLY', label: 'Mensual' },
                { value: 'CUSTOM', label: 'Personalizado' },
              ]}
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              disabled={!!orgId}
            />
          </div>
          <Button onClick={handleGenerate} disabled={generate.isPending}>
            <Plus className="h-4 w-4" />
            {generate.isPending ? 'Generando…' : 'Generar reporte'}
          </Button>
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && (
        <EmptyState title="Sin reportes">
          Genera tu primer reporte ejecutivo con datos reales.
        </EmptyState>
      )}

      {data &&
        data.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-5">
              <button
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)]">
                    <FileBarChart className="h-4 w-4 text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--color-foreground)]">
                      {r.title}
                    </h3>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {formatDate(r.createdAt)}
                    </p>
                  </div>
                </div>
                <Badge className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                  {r.reportType}
                </Badge>
              </button>

              {openId === r.id && (
                <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                  <AgentContent content={r.content} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
