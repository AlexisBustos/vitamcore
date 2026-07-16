/** Devuelve una nueva fecha sumando `months` meses (en UTC). */
export function addMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()),
  );
}
