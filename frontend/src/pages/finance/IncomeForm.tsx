// Wrapper delgado sobre LedgerForm para el formulario de ingresos.
import { LedgerForm } from '@/components/finance/LedgerForm';
import { incomeStatusOptions } from '@/lib/domain';
import { useSaveIncome } from '@/hooks/useFinance';
import type { IncomeRecord } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  income?: IncomeRecord | null;
  defaultOrganizationId?: string;
}

export function IncomeForm({ open, onClose, income, defaultOrganizationId }: Props) {
  const save = useSaveIncome();
  return (
    <LedgerForm
      open={open}
      onClose={onClose}
      record={income}
      defaultOrganizationId={defaultOrganizationId}
      config={{
        title: { create: 'Nuevo ingreso', edit: 'Editar ingreso' },
        partyField: {
          key: 'clientName',
          label: 'Cliente',
          value: income?.clientName,
        },
        dateField: {
          key: 'incomeDate',
          label: 'Fecha de ingreso',
          value: income?.incomeDate,
        },
        statusOptions: incomeStatusOptions,
        defaultStatus: 'EXPECTED',
        categoryPlaceholder: 'Ej: Consulta médica',
        recurringLabel: 'Ingreso recurrente',
        save,
      }}
    />
  );
}
