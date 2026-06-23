import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDate, formatMoney } from '@/lib/domain';
import { getErrorMessage } from '@/lib/errors';
import type { FinancialImportType } from '@/types/domain';
import {
  useBankAccounts,
  useConfirmFinanceImport,
  useCreateBankAccount,
  useFinanceImportBatches,
  useFinanceImportPreview,
  type ImportPreviewResponse,
  type ImportPreviewRow,
} from '@/hooks/useFinance';

const importTypeOptions: { value: FinancialImportType; label: string }[] = [
  { value: 'SALES_REPORT', label: 'Reporte de ventas' },
  { value: 'PURCHASE_REPORT', label: 'Reporte de compras' },
  { value: 'BANK_STATEMENT', label: 'Cartola bancaria' },
];

const statusLabel: Record<ImportPreviewRow['status'], string> = {
  VALID: 'Válida',
  WARNING: 'Advertencia',
  DUPLICATE: 'Duplicada',
  ERROR: 'Error',
};

export function FinanceImportsTab({
  organizationId,
}: {
  organizationId?: string;
}) {
  const [type, setType] = useState<FinancialImportType>('SALES_REPORT');
  const [periodMonth, setPeriodMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [bankAccountId, setBankAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
  });

  const accounts = useBankAccounts(organizationId);
  const batches = useFinanceImportBatches({ organizationId });
  const createAccount = useCreateBankAccount();
  const previewImport = useFinanceImportPreview();
  const confirmImport = useConfirmFinanceImport();

  const bankOptions = useMemo(
    () =>
      (accounts.data ?? []).map((account) => ({
        value: account.id,
        label: `${account.name} · ${account.accountNumber}`,
      })),
    [accounts.data],
  );

  const requiresAccount = type === 'BANK_STATEMENT';
  const canPreview =
    !!organizationId &&
    !!periodMonth &&
    !!file &&
    (!requiresAccount || !!bankAccountId);

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    if (!organizationId) return;
    const result = await createAccount.mutateAsync({
      organizationId,
      name: accountForm.name,
      bankName: accountForm.bankName || null,
      accountNumber: accountForm.accountNumber,
      currency: 'CLP',
    });
    setBankAccountId(result.data.id);
    setAccountForm({ name: '', bankName: '', accountNumber: '' });
  }

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    if (!organizationId || !file) return;
    const result = await previewImport.mutateAsync({
      organizationId,
      bankAccountId: requiresAccount ? bankAccountId : undefined,
      type,
      periodMonth: `${periodMonth}-01`,
      file,
    });
    setPreview(result);
  }

  async function handleConfirm() {
    if (!preview) return;
    await confirmImport.mutateAsync(preview.batch.id);
    setPreview(null);
    setFile(null);
  }

  if (!organizationId) {
    return (
      <EmptyState title="Selecciona una empresa">
        Elige una empresa arriba para cargar reportes mensuales y cartolas.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">
              Nueva importación mensual
            </h2>
          </div>

          <form className="grid gap-4 md:grid-cols-2" onSubmit={handlePreview}>
            <Field label="Período">
              <Input
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
              />
            </Field>

            <Field label="Tipo de archivo">
              <Select
                options={importTypeOptions}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as FinancialImportType);
                  setPreview(null);
                }}
              />
            </Field>

            {requiresAccount && (
              <Field label="Cuenta bancaria">
                <Select
                  options={bankOptions}
                  placeholder="Seleccionar cuenta"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                />
              </Field>
            )}

            <Field label="Archivo">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
            </Field>

            <div className="flex items-end md:col-span-2">
              <Button
                type="submit"
                disabled={!canPreview || previewImport.isPending}
              >
                <Upload className="h-4 w-4" />
                {previewImport.isPending ? 'Procesando…' : 'Vista previa'}
              </Button>
            </div>
          </form>

          {previewImport.isError && (
            <div className="mt-4">
              <ErrorState message={getErrorMessage(previewImport.error)} />
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">
              Cuentas bancarias
            </h2>
          </div>

          {accounts.isLoading && <Spinner label="Cargando cuentas…" />}
          {accounts.isError && (
            <ErrorState message={getErrorMessage(accounts.error)} />
          )}

          {accounts.data && accounts.data.length > 0 && (
            <div className="mb-4 space-y-2">
              {accounts.data.map((account) => (
                <div
                  key={account.id}
                  className="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <p className="font-medium text-[var(--color-foreground)]">
                    {account.name}
                  </p>
                  <p className="text-[var(--color-muted-foreground)]">
                    {account.bankName ?? 'Banco sin especificar'} ·{' '}
                    {account.accountNumber}
                  </p>
                </div>
              ))}
            </div>
          )}

          <form className="space-y-3" onSubmit={handleCreateAccount}>
            <Input
              placeholder="Nombre de cuenta"
              value={accountForm.name}
              onChange={(e) =>
                setAccountForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <Input
              placeholder="Banco"
              value={accountForm.bankName}
              onChange={(e) =>
                setAccountForm((f) => ({ ...f, bankName: e.target.value }))
              }
            />
            <Input
              placeholder="Número de cuenta"
              value={accountForm.accountNumber}
              onChange={(e) =>
                setAccountForm((f) => ({
                  ...f,
                  accountNumber: e.target.value,
                }))
              }
            />
            <Button
              type="submit"
              variant="outline"
              disabled={
                !accountForm.name ||
                !accountForm.accountNumber ||
                createAccount.isPending
              }
            >
              <Building2 className="h-4 w-4" />
              Agregar cuenta
            </Button>
          </form>

          {createAccount.isError && (
            <div className="mt-3">
              <ErrorState message={getErrorMessage(createAccount.error)} />
            </div>
          )}
        </Card>
      </div>

      {preview && (
        <PreviewPanel
          preview={preview}
          isConfirming={confirmImport.isPending}
          confirmError={
            confirmImport.isError ? getErrorMessage(confirmImport.error) : null
          }
          onConfirm={handleConfirm}
        />
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--color-foreground)]">
            Últimas importaciones
          </h2>
        </div>
        {batches.isLoading && <Spinner label="Cargando importaciones…" />}
        {batches.isError && <ErrorState message={getErrorMessage(batches.error)} />}
        {batches.data && batches.data.length === 0 && (
          <EmptyState title="Sin importaciones registradas" />
        )}
        {batches.data && batches.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Período</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Archivo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Filas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {batches.data.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-4 py-3">{formatDate(batch.periodMonth)}</td>
                    <td className="px-4 py-3">{importTypeName(batch.type)}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {batch.originalFileName}
                    </td>
                    <td className="px-4 py-3">{batchStatusName(batch.status)}</td>
                    <td className="px-4 py-3 text-right">{batch.rowsTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PreviewPanel({
  preview,
  isConfirming,
  confirmError,
  onConfirm,
}: {
  preview: ImportPreviewResponse;
  isConfirming: boolean;
  confirmError: string | null;
  onConfirm: () => void;
}) {
  const rows = preview.rows.slice(0, 50);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-foreground)]">
            Vista previa
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {preview.batch.originalFileName}
          </p>
        </div>
        <Button onClick={onConfirm} disabled={isConfirming}>
          <CheckCircle2 className="h-4 w-4" />
          {isConfirming ? 'Confirmando…' : 'Confirmar importación'}
        </Button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryCard label="Filas" value={String(preview.batch.rowsTotal)} />
        <SummaryCard label="Válidas" value={String(preview.batch.rowsValid)} />
        <SummaryCard
          label="Duplicadas"
          value={String(preview.batch.rowsDuplicated)}
        />
        <SummaryCard
          label="Ingresos"
          value={formatMoney(preview.batch.totalIncome)}
        />
        <SummaryCard
          label="Gastos"
          value={formatMoney(preview.batch.totalExpense)}
        />
        <SummaryCard
          label="Banco"
          value={`${formatMoney(preview.batch.totalCredits)} / ${formatMoney(
            preview.batch.totalCharges,
          )}`}
        />
      </div>

      {confirmError && (
        <div className="px-5 pb-4">
          <ErrorState message={confirmError} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Advertencias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <tr key={row.dedupeKey}>
                <td className="px-4 py-3">{statusLabel[row.status]}</td>
                <td className="px-4 py-3">{rowDescription(row)}</td>
                <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                  {rowDate(row)}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {rowAmount(row)}
                </td>
                <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                  {row.warnings.join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function importTypeName(type: FinancialImportType) {
  return importTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function batchStatusName(status: string) {
  if (status === 'PREVIEW') return 'Vista previa';
  if (status === 'CONFIRMED') return 'Confirmada';
  if (status === 'FAILED') return 'Fallida';
  return status;
}

function rowDescription(row: ImportPreviewRow) {
  return String(
    row.data.description ??
      row.data.clientName ??
      row.data.vendorName ??
      'Movimiento importado',
  );
}

function rowDate(row: ImportPreviewRow) {
  const value =
    row.data.incomeDate ?? row.data.expenseDate ?? row.data.transactionDate;
  return typeof value === 'string' ? formatDate(value) : '—';
}

function rowAmount(row: ImportPreviewRow) {
  const amount =
    Number(row.data.amount) ||
    Number(row.data.creditAmount) ||
    Number(row.data.chargeAmount) ||
    0;
  return amount ? formatMoney(amount) : '—';
}
