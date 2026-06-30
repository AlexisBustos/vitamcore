// Categorías de movimientos bancarios + reglas de clasificación automática.
// Única fuente de verdad: la usa el import (createRow) y el backfill.

// Tupla `const` (NO string[]): z.enum exige una tupla no vacía.
export const BANK_CATEGORIES = [
  'TRASPASO_INTERNO',
  'FONASA',
  'VENTAS',
  'TRANSFER_IN',
  'COMBUSTIBLE',
  'CREDITOS',
  'IMPUESTOS',
  'COMISIONES',
  'HONORARIOS',
  'PROVEEDORES',
] as const;

export type BankCategory = (typeof BANK_CATEGORIES)[number];
export type BankCategoryType = 'INCOME' | 'EXPENSE' | 'NEUTRAL';

export const BANK_CATEGORY_TYPE: Record<BankCategory, BankCategoryType> = {
  TRASPASO_INTERNO: 'NEUTRAL',
  FONASA: 'INCOME',
  VENTAS: 'INCOME',
  TRANSFER_IN: 'INCOME',
  COMBUSTIBLE: 'EXPENSE',
  CREDITOS: 'EXPENSE',
  IMPUESTOS: 'EXPENSE',
  COMISIONES: 'EXPENSE',
  HONORARIOS: 'EXPENSE',
  PROVEEDORES: 'EXPENSE',
};

// Reglas ordenadas; la primera que calza gana. `when` opcional restringe por dirección.
type Rule = {
  category: BankCategory;
  when?: 'charge' | 'credit';
  test: (d: string) => boolean;
};

const RULES: Rule[] = [
  {
    category: 'TRASPASO_INTERNO',
    test: (d) =>
      d.startsWith('traspaso a cuenta:') || d.startsWith('traspaso de cuenta:'),
  },
  { category: 'FONASA', test: (d) => d.includes('fonasa') },
  {
    category: 'VENTAS',
    test: (d) =>
      d.startsWith('deposito en efectivo') || d.includes('banchile pagos'),
  },
  { category: 'TRANSFER_IN', test: (d) => d.startsWith('traspaso de:') },
  { category: 'COMBUSTIBLE', test: (d) => d.includes('copec') },
  { category: 'CREDITOS', test: (d) => d.includes('pago de credito') },
  {
    category: 'IMPUESTOS',
    test: (d) =>
      d.includes('sii') ||
      d.includes('tesoreria') ||
      d.includes('ppm') ||
      d.includes(' iva') ||
      d.includes('impto'),
  },
  {
    category: 'COMISIONES',
    test: (d) =>
      d.includes('comision') ||
      d.includes('mantencion') ||
      d.includes('impuesto cheques'),
  },
  { category: 'HONORARIOS', test: (d) => d.startsWith('traspaso a:') },
  { category: 'PROVEEDORES', when: 'charge', test: (d) => d.startsWith('pago:') },
];

/// Clasifica un movimiento. Devuelve null ("Sin categoría / Otros") si nada calza.
export function categorize(
  description: string,
  isCharge: boolean,
): BankCategory | null {
  const d = description.trim().toLowerCase();
  for (const r of RULES) {
    if (r.when === 'charge' && !isCharge) continue;
    if (r.when === 'credit' && isCharge) continue;
    if (r.test(d)) return r.category;
  }
  return null;
}

export type RuleDirection = 'CHARGE' | 'CREDIT' | 'ANY';

/// Normaliza para comparar: minúsculas + sin diacríticos + colapsa espacios
/// internos. NO hace trim(): un espacio inicial/final en matchText es un
/// centinela de borde de palabra deliberado (ej. ' iva' para no calzar 'activa').
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

/// Clasifica un movimiento contra reglas ya cargadas (activas, ordenadas por
/// priority asc). matchText se asume YA normalizado. Primera que calza gana.
/// Devuelve la categoryKey o null ("Sin categoría") si nada calza.
export function categorizeWith(
  rules: { categoryKey: string; matchText: string; direction: RuleDirection }[],
  description: string,
  isCharge: boolean,
): string | null {
  const d = normalizeText(description);
  for (const r of rules) {
    if (r.direction === 'CHARGE' && !isCharge) continue;
    if (r.direction === 'CREDIT' && isCharge) continue;
    if (d.includes(r.matchText)) return r.categoryKey;
  }
  return null;
}
