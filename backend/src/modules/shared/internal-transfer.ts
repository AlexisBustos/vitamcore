/**
 * Detección de traspasos internos entre cuentas propias.
 *
 * En la cartola, mover plata entre dos cuentas de la misma empresa aparece como
 * "Traspaso A/De Cuenta: <nº>" (los pagos a terceros son "Traspaso A: <nombre>").
 * Estos traspasos no son ingreso ni gasto: son plata propia moviéndose, así que
 * no deben contar como "suelto" en el cuadre ni buscar factura.
 */

/** Solo dígitos, sin ceros a la izquierda (para comparar cuentas con distinto formato). */
export function normalizeAccountNumber(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '');
}

/** Set de números de cuenta propios normalizados; descarta los muy cortos (evita colisiones). */
export function buildOwnAccounts(accountNumbers: string[]): Set<string> {
  const set = new Set<string>();
  for (const n of accountNumbers) {
    const norm = normalizeAccountNumber(n);
    if (norm.length >= 6) set.add(norm);
  }
  return set;
}

/**
 * true si el movimiento es un traspaso y su descripción referencia una cuenta
 * propia (la contraparte del traspaso es tuya).
 */
export function isInternalTransfer(
  description: string,
  ownAccounts: Set<string>,
): boolean {
  if (ownAccounts.size === 0) return false;
  if (!/traspaso/i.test(description)) return false;
  const digits = description.replace(/\D/g, '');
  if (!digits) return false;
  const trimmed = digits.replace(/^0+/, '');
  for (const acc of ownAccounts) {
    if (trimmed.includes(acc) || digits.includes(acc)) return true;
  }
  return false;
}
