import { useTaskDetail, useSaveTask } from '@/hooks/useTasks';
import { useAssignees } from '@/hooks/useAssignees';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LabelChips } from './LabelChips';
import { LabelPicker } from './LabelPicker';
import { ChecklistSection } from './ChecklistSection';
import { ActivityFeed } from './ActivityFeed';
import { priorityOptions, taskStatusOptions } from '@/lib/domain';

function toDateInput(v: string | null | undefined) {
  return v ? v.slice(0, 10) : '';
}

export function TaskPanel({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data: task } = useTaskDetail(taskId);
  const save = useSaveTask();
  const { data: assignees } = useAssignees();
  const open = !!taskId;

  function patch(data: Record<string, unknown>) {
    if (task) save.mutate({ id: task.id, data });
  }

  return (
    <Drawer open={open} onClose={onClose} title={task?.title ?? 'Tarea'}>
      {!task ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <Field label="Título">
            <Input
              defaultValue={task.title}
              onBlur={(e) => e.target.value !== task.title && e.target.value.trim() && patch({ title: e.target.value })}
            />
          </Field>

          {task.project?.name && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Proyecto: {task.project.name}
            </p>
          )}

          <div>
            <p className="mb-1 text-xs text-[var(--color-muted-foreground)]">Etiquetas</p>
            <LabelChips labels={(task.labels ?? []).map((tl) => tl.label)} />
            <div className="mt-2">
              <LabelPicker
                organizationId={task.organizationId}
                selected={(task.labels ?? []).map((tl) => tl.label.id)}
                onChange={(labelIds) => patch({ labelIds })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <Select options={taskStatusOptions} value={task.status} onChange={(e) => patch({ status: e.target.value })} />
            </Field>
            <Field label="Prioridad">
              <Select options={priorityOptions} value={task.priority} onChange={(e) => patch({ priority: e.target.value })} />
            </Field>
            <Field label="Responsable">
              <Select
                options={(assignees ?? []).map((u) => ({ value: u.id, label: u.name }))}
                placeholder="Sin asignar"
                value={task.ownerId ?? ''}
                onChange={(e) => patch({ ownerId: e.target.value || null })}
              />
            </Field>
            <div />
            <Field label="Inicio">
              <Input type="date" defaultValue={toDateInput(task.startDate)} onChange={(e) => patch({ startDate: e.target.value || null })} />
            </Field>
            <Field label="Vencimiento">
              <Input type="date" defaultValue={toDateInput(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea
              defaultValue={task.description ?? ''}
              onBlur={(e) => e.target.value !== (task.description ?? '') && patch({ description: e.target.value || null })}
            />
          </Field>

          <ChecklistSection taskId={task.id} items={task.checklistItems ?? []} />

          <ActivityFeed
            taskId={task.id}
            comments={task.comments ?? []}
            activity={task.activity ?? []}
          />
        </div>
      )}
    </Drawer>
  );
}
