import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ContextFields, type ContextValue } from '@/components/ContextFields';
import { documentStatusOptions, documentTypeOptions } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import { useSaveDocument } from '@/hooks/useDocuments';
import type { DocumentRecord } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  document?: DocumentRecord | null;
  defaultOrganizationId?: string;
}

export function DocumentForm({
  open,
  onClose,
  document,
  defaultOrganizationId,
}: Props) {
  const editing = !!document;
  const save = useSaveDocument();
  const [error, setError] = useState<string | null>(null);

  const [ctx, setCtx] = useState<ContextValue>({
    organizationId: document?.organizationId ?? defaultOrganizationId ?? '',
    businessUnitId: document?.businessUnitId ?? '',
    projectId: document?.projectId ?? '',
  });

  const [form, setForm] = useState({
    title: document?.title ?? '',
    documentType: document?.documentType ?? 'OTHER',
    status: document?.status ?? 'ACTIVE',
    clientName: document?.clientName ?? '',
    description: document?.description ?? '',
    tags: (document?.tags ?? []).join(', '),
    fileName: document?.fileName ?? '',
    fileUrl: document?.fileUrl ?? '',
    aiSummary: document?.aiSummary ?? '',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const base = {
      businessUnitId: ctx.businessUnitId || null,
      projectId: ctx.projectId || null,
      title: form.title,
      documentType: form.documentType,
      status: form.status,
      clientName: form.clientName || null,
      description: form.description || null,
      tags,
      fileName: form.fileName || null,
      fileUrl: form.fileUrl || null,
      aiSummary: form.aiSummary || null,
    };
    try {
      await save.mutateAsync({
        id: document?.id,
        data: editing ? base : { ...base, organizationId: ctx.organizationId },
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar documento' : 'Nuevo documento'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ContextFields
          value={ctx}
          onChange={(p) => setCtx((c) => ({ ...c, ...p }))}
          lockOrganization={editing}
        />

        <Field label="Título" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo">
            <Select
              options={documentTypeOptions}
              value={form.documentType}
              onChange={(e) => set('documentType', e.target.value)}
            />
          </Field>
          <Field label="Estado">
            <Select
              options={documentStatusOptions}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </Field>
          <Field label="Cliente">
            <Input
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Etiquetas (separadas por coma)">
          <Input
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="ventas, legal, alox"
          />
        </Field>

        <Field label="Descripción">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        {/* Campos preparados para almacenamiento real (S3/R2). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de archivo">
            <Input
              value={form.fileName}
              onChange={(e) => set('fileName', e.target.value)}
              placeholder="propuesta.pdf"
            />
          </Field>
          <Field label="URL del archivo">
            <Input
              value={form.fileUrl}
              onChange={(e) => set('fileUrl', e.target.value)}
              placeholder="https://… (futuro: S3/R2)"
            />
          </Field>
        </div>

        <Field label="Resumen IA (preparado para integración)">
          <Textarea
            value={form.aiSummary}
            onChange={(e) => set('aiSummary', e.target.value)}
            placeholder="Se completará automáticamente con IA en el Sprint 3."
          />
        </Field>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
