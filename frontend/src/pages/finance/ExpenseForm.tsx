// Wrapper delgado sobre LedgerForm para el formulario de gastos.
import { LedgerForm } from '@/components/finance/LedgerForm';
import { expenseStatusOptions } from '@/lib/domain';
import { useSaveExpense } from '@/hooks/useFinance';
import type { ExpenseRecord } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  expense?: ExpenseRecord | null;
  defaultOrganizationId?: string;
}

export function ExpenseForm({ open, onClose, expense, defaultOrganizationId }: Props) {
  const save = useSaveExpense();
  return (
    <LedgerForm
      open={open}
      onClose={onClose}
      record={expense}
      defaultOrganizationId={defaultOrganizationId}
      config={{
        title: { create: 'Nuevo gasto', edit: 'Editar gasto' },
        partyField: {
          key: 'vendorName',
          label: 'Proveedor',
          value: expense?.vendorName,
        },
        dateField: {
          key: 'expenseDate',
          label: 'Fecha del gasto',
          value: expense?.expenseDate,
        },
        statusOptions: expenseStatusOptions,
        defaultStatus: 'PENDING',
        categoryPlaceholder: 'Ej: Infraestructura',
        recurringLabel: 'Gasto recurrente',
        save,
      }}
    />
  );
}
