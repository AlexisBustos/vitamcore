// Períodos en el frontend: etiquetas legibles y "hoy" en horario de Chile.
// El backend no comparte código con el frontend (paquetes separados), así que
// esta es una copia mínima de la aritmética de semana ISO. El backend sigue
// siendo la fuente de verdad de los rangos; aquí solo etiquetamos y elegimos.

export type Granularity = 'week' | 'month';

const DIA_MS = 86_400_000;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/// 'YYYY-MM-DD' de hoy en Chile (horario de verano resuelto por el runtime).
function hoyEnChile(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function diaIso(date: Date): number {
  return date.getUTCDay() || 7; // lunes = 1 … domingo = 7
}

function lunesDeLaSemana(date: Date): Date {
  return new Date(date.getTime() - (diaIso(date) - 1) * DIA_MS);
}

function lunesDeLaSemana1(year: number): Date {
  return lunesDeLaSemana(new Date(Date.UTC(year, 0, 4)));
}

/// Lunes (fecha) de la semana ISO 'YYYY-Www'.
function lunesDeClave(key: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return new Date(NaN);
  const year = Number(m[1]);
  const week = Number(m[2]);
  return new Date(lunesDeLaSemana1(year).getTime() + (week - 1) * 7 * DIA_MS);
}

/// Clave del período que contiene esa fecha de calendario (UTC).
function claveDeFecha(g: Granularity, fecha: Date): string {
  if (g === 'month') {
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    return `${fecha.getUTCFullYear()}-${mes}`;
  }
  const jueves = new Date(fecha.getTime() + (4 - diaIso(fecha)) * DIA_MS);
  const year = jueves.getUTCFullYear();
  const semana =
    Math.round((jueves.getTime() - lunesDeLaSemana1(year).getTime()) / (7 * DIA_MS)) + 1;
  return `${year}-W${String(semana).padStart(2, '0')}`;
}

/// Clave del período en curso ('2026-W28' o '2026-07'), resuelto en Chile.
export function currentPeriodKey(g: Granularity, now = new Date()): string {
  return claveDeFecha(g, new Date(`${hoyEnChile(now)}T00:00:00.000Z`));
}

/// Clave desplazada `delta` períodos (negativo = hacia atrás), misma granularidad.
export function shiftPeriodKey(key: string, delta: number): string {
  if (key.includes('W')) {
    const lunes = lunesDeClave(key);
    return claveDeFecha('week', new Date(lunes.getTime() + delta * 7 * DIA_MS));
  }
  const [y, m] = key.split('-').map(Number);
  return claveDeFecha('month', new Date(Date.UTC(y, m - 1 + delta, 1)));
}

/// Las últimas `n` claves de período hasta la actual (inclusive), ascendente.
export function lastPeriods(g: Granularity, n: number, now = new Date()): string[] {
  const current = currentPeriodKey(g, now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftPeriodKey(current, -i));
  return out;
}

/// Etiqueta legible: '2026-07' → 'Julio 2026'; '2026-W28' → 'Semana del 6 al 12 jul'.
export function periodLabel(key: string): string {
  if (key.includes('W')) {
    const lunes = lunesDeClave(key);
    if (Number.isNaN(lunes.getTime())) return key;
    const domingo = new Date(lunes.getTime() + 6 * DIA_MS);
    const d1 = lunes.getUTCDate();
    const d2 = domingo.getUTCDate();
    const m1 = MESES_CORTOS[lunes.getUTCMonth()];
    const m2 = MESES_CORTOS[domingo.getUTCMonth()];
    // Si la semana cruza de mes, se nombran ambos ("del 29 sep al 5 oct").
    return m1 === m2
      ? `Semana del ${d1} al ${d2} ${m2}`
      : `Semana del ${d1} ${m1} al ${d2} ${m2}`;
  }
  const [y, m] = key.split('-').map(Number);
  const nombre = MESES[m - 1];
  return nombre != null ? `${nombre} ${y}` : key;
}

/// Etiqueta compacta para ejes: '2026-W28' → 'S28'; '2026-07' → 'jul'.
export function periodShortLabel(key: string): string {
  if (key.includes('W')) {
    const m = /-W(\d{2})$/.exec(key);
    return m ? `S${Number(m[1])}` : key;
  }
  const [, m] = key.split('-').map(Number);
  return MESES_CORTOS[m - 1] ?? key;
}

/// Granularidad implícita en una clave de período.
export function granularityOf(key: string): Granularity {
  return key.includes('W') ? 'week' : 'month';
}
