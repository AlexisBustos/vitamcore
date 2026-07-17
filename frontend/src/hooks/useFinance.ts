// Barrel de compatibilidad: re-exporta los hooks de finanzas ya divididos en
// módulos propios (income, expenses, resumen, categorías/reglas, importaciones
// bancarias y conciliación) para no romper los imports existentes de `useFinance`.
export { useIncome, useIncomePeriods, useSaveIncome, useDeleteIncome, useRegisterPayment, useBulkRegisterPayment } from './useIncome';
export { useExpenses, useExpensePeriods, useSaveExpense, useDeleteExpense, useRegisterExpensePayment, useBulkRegisterExpensePayment } from './useExpenses';
export type { FinanceFilters, Granularity, PeriodSelection } from './finance-shared';
export { useFinanceSummary, useFinanceTrend, useConsolidated, useCashflow } from './useFinanceSummary';
export {
  useBankCategories, useSaveCategory, useDeleteCategory, useCategoryRules,
  useSaveRule, useDeleteRule, useReorderRules, useReapplyRules, useRulePreview,
  useBulkSetCategory, useSetTransactionCategory,
} from './useBankCategories';
export {
  useBankAccounts, useCreateBankAccount, useUpdateBankAccount,
  useBankTransactions, useBankTransactionPeriods, useBankPeriodic, useBankByCategory,
  useImportCoverage,
  useFinanceImportBatches, useFinanceImportPreview, useConfirmFinanceImport,
} from './useBankImports';
export type {
  FinanceImportFilters, ImportPreviewInput, ImportPreviewRow, ImportPreviewResponse,
  BankTransactionFilters,
} from './useBankImports';
export { useReconciliationCandidates, useAutoReconcile, useRecognizeTransfers } from './useReconciliation';
