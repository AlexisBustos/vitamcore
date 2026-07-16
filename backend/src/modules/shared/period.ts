/**
 * Única fuente de verdad de los períodos (semana ISO y mes).
 *
 * Las fechas del dominio son fechas de CALENDARIO ancladas a medianoche UTC
 * (ver normalizeDate en finance-imports.parser.ts): no son instantes. Por eso
 * toda la aritmética de aquí es UTC. La zona horaria de Chile aparece en un
 * único punto —currentPeriod— porque es el único sitio donde un instante real
 * tiene que convertirse en una fecha de calendario.
 *
 * Detalle en docs/superpowers/specs/2026-07-16-finanzas-granularidad-semanal-design.md.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../utils/http-error';

export type Granularity = 'week' | 'month';

const DIA_MS = 86_400_000;
const ZONA_HORARIA = 'America/Santiago';

/// 'YYYY-MM-DD' de hoy en Chile. Intl resuelve el horario de verano por nosotros.
function hoyEnChile(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/// Día de la semana ISO: lunes = 1 … domingo = 7 (getUTCDay da domingo = 0).
function diaIso(date: Date): number {
  return date.getUTCDay() || 7;
}

/// Lunes de la semana ISO que contiene a `date`.
function lunesDeLaSemana(date: Date): Date {
  return new Date(date.getTime() - (diaIso(date) - 1) * DIA_MS);
}

/// Lunes de la semana 1 del año ISO: la semana que contiene el 4 de enero.
function lunesDeLaSemana1(year: number): Date {
  return lunesDeLaSemana(new Date(Date.UTC(year, 0, 4)));
}

/// Semanas ISO del año: 52, o 53 cuando el año "empuja" una semana extra.
export function semanasDelAño(year: number): number {
  const inicio = lunesDeLaSemana1(year);
  const inicioSiguiente = lunesDeLaSemana1(year + 1);
  return Math.round((inicioSiguiente.getTime() - inicio.getTime()) / (7 * DIA_MS));
}

function parseClaveSemana(key: string): { year: number; week: number } {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw badRequest(`Clave de semana inválida: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > semanasDelAño(year)) {
    throw badRequest(`Semana inexistente: ${key}`);
  }
  return { year, week };
}

function parseClaveMes(key: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw badRequest(`Clave de mes inválida: ${key}`);
  const month = Number(m[2]);
  // La regex de Zod ya impide que un mes fuera de rango llegue por la API; se
  // valida igual para no dejar una granularidad validada y la otra no.
  if (month < 1 || month > 12) throw badRequest(`Mes inexistente: ${key}`);
  return { year: Number(m[1]), month };
}

/** Rango [gte, lt) en UTC del período. */
export function periodRange(g: Granularity, key: string): { gte: Date; lt: Date } {
  if (g === 'month') {
    const { year, month } = parseClaveMes(key);
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }
  const { year, week } = parseClaveSemana(key);
  const gte = new Date(lunesDeLaSemana1(year).getTime() + (week - 1) * 7 * DIA_MS);
  return { gte, lt: new Date(gte.getTime() + 7 * DIA_MS) };
}

/** Clave del período que contiene esa fecha de calendario (UTC). */
export function periodKey(g: Granularity, date: Date): string {
  if (g === 'month') {
    const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${date.getUTCFullYear()}-${mes}`;
  }
  // El año ISO de una semana es el año de su jueves: así el borde de año cae
  // del lado correcto sin casos especiales.
  const jueves = new Date(date.getTime() + (4 - diaIso(date)) * DIA_MS);
  const year = jueves.getUTCFullYear();
  const semana =
    Math.round((jueves.getTime() - lunesDeLaSemana1(year).getTime()) / (7 * DIA_MS)) + 1;
  return `${year}-W${String(semana).padStart(2, '0')}`;
}

/** Clave del período en curso. Resuelve "hoy" en America/Santiago. */
export function currentPeriod(g: Granularity, now = new Date()): string {
  return periodKey(g, new Date(`${hoyEnChile(now)}T00:00:00.000Z`));
}

/** Serie contigua de claves entre dos períodos, ambos inclusive, ascendente. */
export function periodSeries(g: Granularity, fromKey: string, toKey: string): string[] {
  const fin = periodRange(g, toKey).gte.getTime();
  const out: string[] = [];
  let cursor = periodRange(g, fromKey).gte;
  while (cursor.getTime() <= fin) {
    out.push(periodKey(g, cursor));
    cursor =
      g === 'week'
        ? new Date(cursor.getTime() + 7 * DIA_MS)
        : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return out;
}

// Whitelist tipada: los identificadores de tabla/columna y el truncador NO
// pueden ir como parámetros de consulta, así que van por aquí y nunca crudos.
const TRUNC = {
  week: { unit: 'week', format: 'IYYY-"W"IW' },
  month: { unit: 'month', format: 'YYYY-MM' },
} as const;

const PERIOD_SOURCES = {
  income: { table: 'income_records', column: 'incomeDate' },
  expense: { table: 'expense_records', column: 'expenseDate' },
  bank: { table: 'bank_transactions', column: 'transactionDate' },
} as const;

/**
 * Consulta de períodos. La unión discriminada existe porque income_records y
 * expense_records NO tienen columna bankAccountId: así, pasar bankAccountId
 * junto a source:'income' es un error de tipos y no un filtro que se ignora.
 */
export type PeriodQuery =
  | { source: 'income' | 'expense'; organizationId?: string }
  | { source: 'bank'; organizationId?: string; bankAccountId?: string };

/** Claves de período con datos, descendente. */
export async function listPeriods(g: Granularity, q: PeriodQuery): Promise<string[]> {
  const { table, column } = PERIOD_SOURCES[q.source];
  const { unit, format } = TRUNC[g];
  const col = Prisma.raw(`"${column}"`);

  const conditions = [Prisma.sql`${col} IS NOT NULL`];
  if (q.organizationId) {
    conditions.push(Prisma.sql`"organizationId" = ${q.organizationId}`);
  }
  if (q.source === 'bank' && q.bankAccountId) {
    conditions.push(Prisma.sql`"bankAccountId" = ${q.bankAccountId}`);
  }

  const rows = await prisma.$queryRaw<{ periodo: string }[]>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc(${unit}, ${col}), ${format}) AS periodo
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY periodo DESC
  `);
  return rows.map((r) => r.periodo);
}
