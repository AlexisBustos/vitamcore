import { useState } from 'react';
import { FileText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OrganizationFilter } from '@/components/OrganizationFilter';
import { DocumentTypeBadge, DocumentStatusBadge } from '@/components/badges';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/feedback';
import { documentTypeOptions, formatDate } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import {
  useDocuments,
  useDeleteDocument,
  type DocumentFilters,
} from '@/hooks/useDocuments';
import type { DocumentRecord } from '@/types/domain';
import { DocumentForm } from './DocumentForm';

export function DocumentsPage() {
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [form, setForm] = useState<{ open: boolean; item: DocumentRecord | null }>(
    { open: false, item: null },
  );

  const { data, isLoading, isError, error } = useDocuments(filters);
  const remove = useDeleteDocument();

  function set(key: keyof DocumentFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  async function handleDelete(item: DocumentRecord) {
    if (!confirm(`¿Eliminar el documento "${item.title}"?`)) return;
    await remove.mutateAsync(item.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description="Repositorio documental (preparado para lectura con IA y almacenamiento S3/R2)."
        actions={
          <Button onClick={() => setForm({ open: true, item: null })}>
            <Plus className="h-4 w-4" /> Nuevo documento
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OrganizationFilter
            value={filters.organizationId}
            onChange={(v) => set('organizationId', v)}
          />
          <Select
            options={documentTypeOptions}
            placeholder="Todos los tipos"
            value={filters.documentType ?? ''}
            onChange={(e) => set('documentType', e.target.value)}
          />
          <Input
            placeholder="Cliente"
            value={filters.clientName ?? ''}
            onChange={(e) => set('clientName', e.target.value)}
          />
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && (
        <EmptyState title="Sin documentos">
          Registra el primer documento para empezar.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)]">
                      <FileText className="h-5 w-5 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--color-foreground)]">
                        {doc.title}
                      </h3>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {doc.organization?.name}
                        {doc.project ? ` · ${doc.project.name}` : ''}
                        {doc.clientName ? ` · ${doc.clientName}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Editar"
                      onClick={() => setForm({ open: true, item: doc })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Eliminar"
                      onClick={() => handleDelete(doc)}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <DocumentTypeBadge value={doc.documentType} />
                  <DocumentStatusBadge value={doc.status} />
                  {doc.tags.map((t) => (
                    <Badge
                      key={t}
                      className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                    >
                      #{t}
                    </Badge>
                  ))}
                </div>

                {doc.aiSummary && (
                  <div className="mt-3 rounded-md bg-[var(--color-muted)] p-3">
                    <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">
                      <Sparkles className="h-3.5 w-3.5" /> Resumen IA
                    </p>
                    <p className="text-sm text-[var(--color-foreground)]">
                      {doc.aiSummary}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                  Registrado: {formatDate(doc.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {form.open && (
        <DocumentForm
          open={form.open}
          onClose={() => setForm({ open: false, item: null })}
          document={form.item}
          defaultOrganizationId={filters.organizationId}
        />
      )}
    </div>
  );
}
