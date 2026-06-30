// Normalización y matching puro de categorías de movimientos bancarios.
// Las categorías y reglas viven ahora en BD (modelos BankCategory /
// BankCategoryRule). Este archivo solo expone la normalización de texto y la
// función pura de clasificación: las reglas se cargan desde la BD (vía
// getActiveRules) y se pasan a categorizeWith por el import y el backfill.

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
