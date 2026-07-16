# Granularidad semanal en Finanzas — Fases 0 y 1 — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 0 — crear `shared/period.ts` como única fuente de verdad de los períodos y absorber en él las ocho implementaciones que hoy calculan meses por su cuenta, **sin cambiar ningún comportamiento**. Fase 1 — arreglar los dos defectos de deduplicación de las importaciones (clave sin empresa, dedupe intra-lote inexistente) con su migración de datos.

**Architecture:** `period.ts` es aritmética pura de fechas (sin Prisma) salvo `listPeriods`, que centraliza las tres consultas `date_trunc`. `ledger.ts` conserva `monthRange` y `listMonths` como alias delgados para no tocar `ledger.test.ts` (estrategia barrel re-export, ya usada en este repo). En la Fase 1, la `dedupeKey` gana el prefijo de empresa y el preview aprende a deduplicar contra sí mismo.

**Tech Stack:** Express + Prisma (PostgreSQL), Zod, Vitest (BD de test real, `npm run test:db:setup`), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-16-finanzas-granularidad-semanal-design.md` — **léelo antes de empezar**. Las decisiones de producto, el razonamiento de la zona horaria y el diagnóstico de los defectos de dedup están ahí y no se repiten aquí.

**Convenciones del repo que DEBES seguir:**
- Todo en español (comentarios, mensajes de error). Identificadores técnicos en inglés.
- Services lanzan errores con helpers de `src/utils/http-error.ts` (`notFound`, `badRequest`).
- Tests en `backend/test/*.test.ts` con `resetDb`/`disconnect` de `test/db.ts` y fixtures de `test/fixtures.ts`.
- Comandos desde `backend/`: `npm test` (todos) o `npx vitest run test/<archivo>` (uno). Requieren Docker arriba (`docker compose up -d` en la raíz) y la BD de test migrada (`npm run test:db:setup`).
- En SQL crudo, los identificadores de tabla/columna van por **whitelist tipada** con `Prisma.raw`, nunca como parámetro. Los valores sí van parametrizados.

**Desviación deliberada del spec (YAGNI):** el spec lista `periodLabel` en la interfaz de `period.ts`. **No se construye en la Fase 0.** El backend devuelve claves (`2026-W28`), nunca etiquetas; quien necesita "Semana del 6 al 12 jul" es el frontend, que no puede importar código del backend (son paquetes separados). `periodLabel` nace en `frontend/src/lib/period.ts` en la Fase 3. Construirlo ahora sería código muerto.

**Estado de partida:** rama `develop`, limpia, 199 tests verdes en 24 archivos.

---

## Chunk 1: Fase 0 — el período unificado (cero cambio de comportamiento)

> **Criterio de la fase entera:** al terminar, `npm test` da **199 verdes más los nuevos**, y **ningún test existente ha sido modificado**. Si necesitas tocar un test que ya existía, párate: significa que has cambiado un comportamiento y este chunk no lo permite.

### Task 1: `period.ts` — aritmética de períodos

**Files:**
- Create: `backend/src/modules/shared/period.ts`
- Test: `backend/test/period.test.ts`

- [ ] **Step 1: Escribe los tests que fallan**

Crea `backend/test/period.test.ts`. Sin BD: es aritmética pura, no lleva `resetDb`.

```ts
import { describe, expect, test } from 'vitest';
import {
  periodRange,
  periodKey,
  currentPeriod,
  periodSeries,
} from '../src/modules/shared/period';

describe('periodRange mes', () => {
  // Caracterización: valores literales que devuelve el monthRange de HOY.
  // No se compara contra monthRange en vivo porque tras la Task 3 es un alias
  // de esta misma función: compararlos sería compararla consigo misma.
  test('2026-07 devuelve [julio, agosto) en UTC', () => {
    const { gte, lt } = periodRange('month', '2026-07');
    expect(gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  test('2026-12 cruza el año', () => {
    const { gte, lt } = periodRange('month', '2026-12');
    expect(gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  test('mes inexistente lanza badRequest', () => {
    expect(() => periodRange('month', '2026-13')).toThrow(/Mes inexistente/);
  });
});

describe('periodRange semana', () => {
  test('2026-W28 va de lunes 6 a lunes 13 de julio', () => {
    const { gte, lt } = periodRange('week', '2026-W28');
    expect(gte.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  // Borde de año ISO: la semana 1 es la que contiene el 4 de enero.
  test('2026-W01 empieza el 29 de diciembre de 2025', () => {
    const { gte } = periodRange('week', '2026-W01');
    expect(gte.toISOString()).toBe('2025-12-29T00:00:00.000Z');
  });

  test('2026-W53 existe (2026 tiene 53 semanas ISO)', () => {
    const { gte } = periodRange('week', '2026-W53');
    expect(gte.toISOString()).toBe('2026-12-28T00:00:00.000Z');
  });

  test('2025-W53 no existe (2025 tiene 52) y lanza badRequest', () => {
    expect(() => periodRange('week', '2025-W53')).toThrow(/Semana inexistente/);
  });
});

describe('periodKey', () => {
  test('mes', () => {
    expect(periodKey('month', new Date('2026-07-20T00:00:00Z'))).toBe('2026-07');
  });

  test('semana: el domingo cierra su semana', () => {
    expect(periodKey('week', new Date('2026-07-12T00:00:00Z'))).toBe('2026-W28');
  });

  test('semana: el lunes abre la siguiente', () => {
    expect(periodKey('week', new Date('2026-07-13T00:00:00Z'))).toBe('2026-W29');
  });

  // El 31-dic-2026 es jueves: cae en la semana 53 de 2026.
  test('semana: 31-dic-2026 es 2026-W53', () => {
    expect(periodKey('week', new Date('2026-12-31T00:00:00Z'))).toBe('2026-W53');
  });

  // El 1-ene-2027 es viernes: sigue en la semana 53 de 2026, NO en 2027-W01.
  test('semana: 1-ene-2027 sigue siendo 2026-W53', () => {
    expect(periodKey('week', new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });

  test('semana: 29-dic-2025 ya es 2026-W01', () => {
    expect(periodKey('week', new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01');
  });

  test('ida y vuelta: periodKey(periodRange(k).gte) === k', () => {
    for (const k of ['2026-W01', '2026-W28', '2026-W53', '2027-W01']) {
      expect(periodKey('week', periodRange('week', k).gte)).toBe(k);
    }
  });
});

describe('currentPeriod', () => {
  // A las 23:00 en Santiago (UTC-4) ya es el día siguiente en UTC.
  // Debe ganar Santiago: el CEO sigue en el día 12, no en el 13.
  test('23:00 del domingo en Santiago sigue en la semana que cierra', () => {
    const now = new Date('2026-07-13T03:00:00Z'); // 12-jul 23:00 en Santiago
    expect(currentPeriod('week', now)).toBe('2026-W28');
  });

  test('00:30 del lunes en Santiago ya es la semana siguiente', () => {
    const now = new Date('2026-07-13T04:30:00Z'); // 13-jul 00:30 en Santiago
    expect(currentPeriod('week', now)).toBe('2026-W29');
  });

  // El bug de currentMonthRange: a las 23:00 del 31 en Santiago, UTC ya es día 1
  // del mes siguiente. El mes correcto es julio, no agosto.
  test('23:00 del 31 en Santiago sigue en el mes que cierra', () => {
    const now = new Date('2026-08-01T03:00:00Z'); // 31-jul 23:00 en Santiago
    expect(currentPeriod('month', now)).toBe('2026-07');
  });
});

describe('periodSeries', () => {
  test('meses contiguos cruzando el año', () => {
    expect(periodSeries('month', '2026-11', '2027-02')).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02',
    ]);
  });

  test('un solo período', () => {
    expect(periodSeries('month', '2026-07', '2026-07')).toEqual(['2026-07']);
  });

  test('semanas contiguas cruzando el año (2026 tiene 53)', () => {
    expect(periodSeries('week', '2026-W52', '2027-W02')).toEqual([
      '2026-W52', '2026-W53', '2027-W01', '2027-W02',
    ]);
  });

  test('rango invertido devuelve vacío', () => {
    expect(periodSeries('month', '2026-07', '2026-05')).toEqual([]);
  });
});
```

- [ ] **Step 2: Corre los tests y verifica que fallan**

```bash
npx vitest run test/period.test.ts
```
Expected: FAIL — `Cannot find module '../src/modules/shared/period'`.

- [ ] **Step 3: Implementa `period.ts`**

Crea `backend/src/modules/shared/period.ts`:

```ts
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
```

- [ ] **Step 4: Corre los tests y verifica que pasan**

```bash
npx vitest run test/period.test.ts
```
Expected: PASS, 21 tests (3 + 4 + 7 + 3 + 4).

Si `2026-W53` falla, revisa `semanasDelAño`: 2026 empieza en jueves, y un año que empieza en jueves tiene 53 semanas ISO. No "arregles" el test.

- [ ] **Step 5: Verifica que no has roto nada**

```bash
npm test
```
Expected: 220 verdes (199 previos + 21 nuevos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/shared/period.ts backend/test/period.test.ts
git commit -m "feat(finanzas): period.ts, aritmética de semana ISO y mes"
```

---

### Task 2: `listPeriods` — absorber las tres consultas de meses

**Files:**
- Modify: `backend/src/modules/shared/period.ts`
- Test: `backend/test/period.test.ts`

Hoy hay **tres** implementaciones del mismo `date_trunc`/`to_char`: `ledger.ts:40` (income y expense) y `bank-transactions.service.ts:151` (bank). `listPeriods` las sustituye.

- [ ] **Step 1: Escribe los tests que fallan**

Añade a `backend/test/period.test.ts`. Estos **sí** tocan BD:

```ts
import { beforeEach, afterAll } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg, makeIncome, makeExpense, makeBankAccount, makeBankTransaction, makeImportBatch,
} from './fixtures';
import { listPeriods } from '../src/modules/shared/period';

// makeBankTransaction (fixtures.ts:77) recibe un OBJETO, no posicionales, y
// exige importBatchId: es FK obligatoria (schema.prisma:791) y no tiene default.
// Este helper crea el lote una vez y devuelve un atajo por cuenta.
async function movimientosDe(organizationId: string) {
  const lote = await makeImportBatch(organizationId, { type: 'BANK_STATEMENT' });
  return (bankAccountId: string, overrides: Record<string, unknown> = {}) =>
    makeBankTransaction(
      { organizationId, bankAccountId, importBatchId: lote.id },
      overrides,
    );
}

describe('listPeriods', () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  test('income por mes, descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-06-10') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-05') });
    await makeIncome(org.id, { incomeDate: new Date('2026-07-20') });
    expect(await listPeriods('month', { source: 'income', organizationId: org.id }))
      .toEqual(['2026-07', '2026-06']);
  });

  test('income por semana, descendente', async () => {
    const org = await makeOrg();
    await makeIncome(org.id, { incomeDate: new Date('2026-07-06') }); // W28
    await makeIncome(org.id, { incomeDate: new Date('2026-07-12') }); // W28
    await makeIncome(org.id, { incomeDate: new Date('2026-07-13') }); // W29
    expect(await listPeriods('week', { source: 'income', organizationId: org.id }))
      .toEqual(['2026-W29', '2026-W28']);
  });

  test('expense por mes', async () => {
    const org = await makeOrg();
    await makeExpense(org.id, { expenseDate: new Date('2026-05-10') });
    await makeExpense(org.id, { expenseDate: new Date('2026-07-05') });
    expect(await listPeriods('month', { source: 'expense', organizationId: org.id }))
      .toEqual(['2026-07', '2026-05']);
  });

  test('bank filtra por cuenta', async () => {
    const org = await makeOrg();
    const a = await makeBankAccount(org.id, { accountNumber: '111' });
    const b = await makeBankAccount(org.id, { accountNumber: '222' });
    const mov = await movimientosDe(org.id);
    await mov(a.id, { transactionDate: new Date('2026-07-06') });
    await mov(b.id, { transactionDate: new Date('2026-06-10') });
    expect(await listPeriods('month', { source: 'bank', bankAccountId: a.id }))
      .toEqual(['2026-07']);
    expect(await listPeriods('month', { source: 'bank', organizationId: org.id }))
      .toEqual(['2026-07', '2026-06']);
  });

  // El borde de año ISO tiene que salir bien también desde Postgres (IYYY/IW),
  // no solo desde la aritmética de JS. Con 'YYYY-WW' esto daría 2027-W01 y las
  // dos capas discreparían justo en el borde.
  test('bank: el 1-ene-2027 se agrupa en 2026-W53, como en periodKey', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, { transactionDate: new Date('2027-01-01') });
    expect(await listPeriods('week', { source: 'bank', organizationId: org.id }))
      .toEqual(['2026-W53']);
  });

  test('sin datos devuelve vacío', async () => {
    const org = await makeOrg();
    expect(await listPeriods('month', { source: 'income', organizationId: org.id }))
      .toEqual([]);
  });
});
```

El test del 1-ene-2027 es el que importa: comprueba que `to_char(…, 'IYYY-"W"IW')` de Postgres y `periodKey` de JS **coinciden** en el borde de año. Si usaras `'YYYY-WW'` daría `2027-W01` y las dos capas discreparían.

- [ ] **Step 2: Corre los tests y verifica que fallan**

```bash
npx vitest run test/period.test.ts -t listPeriods
```
Expected: FAIL — `listPeriods is not a function`.

- [ ] **Step 3: Implementa `listPeriods`**

Añade a `backend/src/modules/shared/period.ts` (arriba, junto a los imports):

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
```

Y al final del archivo:

```ts
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
```

Nota sobre el `IS NOT NULL`: `ledger.ts:51` lo emite porque `incomeDate`/`expenseDate` son `DateTime?`; `listBankTransactionMonths` lo omite porque `transactionDate` es `NOT NULL`. Emitirlo siempre es idéntico en comportamiento (sobre una columna `NOT NULL` es inerte) y evita un caso especial.

`unit` y `format` sí van parametrizados (`${unit}`): son valores de `date_trunc`/`to_char`, no identificadores. Solo tabla y columna necesitan `Prisma.raw`, y ambos vienen de la whitelist.

- [ ] **Step 4: Corre los tests**

```bash
npx vitest run test/period.test.ts
```
Expected: PASS, 27 tests en el archivo (21 de la Task 1 + 6 de listPeriods).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/shared/period.ts backend/test/period.test.ts
git commit -m "feat(finanzas): listPeriods unifica las tres consultas de períodos"
```

---

### Task 3: Los shims de `ledger.ts`

**Files:**
- Modify: `backend/src/modules/shared/ledger.ts:28-62`
- **NO tocar:** `backend/test/ledger.test.ts`

`test/ledger.test.ts:4` importa `monthRange` y `listMonths` desde `shared/ledger` y los prueba directamente (`:34-40`, `:42-60`). Si los mueves, ese import se rompe y la fase incumple su criterio. Se quedan como alias.

- [ ] **Step 1: Sustituye las implementaciones por alias**

En `backend/src/modules/shared/ledger.ts`, **borra** `monthRange` (`:28-31`), la constante `MONTHS_SOURCES` (`:34-37`) y `listMonths` (`:40-62`). En su lugar:

```ts
import { periodRange, listPeriods } from './period';

// Shims de compatibilidad: la implementación real vive en period.ts. Se
// conservan aquí para no tocar los imports de ledger.test.ts durante la Fase 0
// (misma estrategia que el barrel de frontend/src/hooks/useFinance.ts).
// Mueren en la Fase 3, cuando sus describe se muden a period.test.ts.

/** @deprecated usa periodRange('month', …) */
export function monthRange(month: string): { gte: Date; lt: Date } {
  return periodRange('month', month);
}

/** @deprecated usa listPeriods('month', { source, organizationId }) */
export function listMonths(
  source: 'income' | 'expense',
  organizationId?: string,
): Promise<string[]> {
  return listPeriods('month', { source, organizationId });
}
```

Quita de `ledger.ts` los imports que queden sin uso (`Prisma`, `prisma`) — `reconcilePaidStatus` no los necesita.

- [ ] **Step 2: Corre los tests de ledger SIN tocarlos**

```bash
npx vitest run test/ledger.test.ts
```
Expected: PASS, 7 tests. **Si tienes que editar el test, párate**: significa que el alias no es equivalente.

- [ ] **Step 3: Typecheck**

```bash
npm run build
```
Expected: sin errores. Los consumidores (`income.service.ts:12,259`, `expenses.service.ts:12,231`) siguen compilando: la firma no cambió.

- [ ] **Step 4: Suite completa**

```bash
npm test
```
Expected: 226 verdes (199 + 27).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/shared/ledger.ts
git commit -m "refactor(finanzas): ledger.ts delega en period.ts (shims)"
```

---

### Task 4: `listBankTransactionMonths` delega en `listPeriods`

**Files:**
- Modify: `backend/src/modules/finance-imports/bank-transactions.service.ts:151-168`

Ningún test lo importa (verificado), así que no necesita shim: se reescribe entero.

- [ ] **Step 1: Sustituye el cuerpo**

En `backend/src/modules/finance-imports/bank-transactions.service.ts`, reemplaza `listBankTransactionMonths` (`:151-168`) por:

```ts
export async function listBankTransactionMonths(filters: {
  organizationId?: string;
  bankAccountId?: string;
}) {
  return listPeriods('month', { source: 'bank', ...filters });
}
```

Añade el import: `import { listPeriods } from '../shared/period';`

- [ ] **Step 2: Typecheck y suite**

```bash
npm run build && npm test
```
Expected: sin errores, 226 verdes (esta tarea no añade tests).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/finance-imports/bank-transactions.service.ts
git commit -m "refactor(finanzas): listBankTransactionMonths delega en listPeriods"
```

---

### Task 5: Red de tests para `listBankMonthly` (ANTES de tocarlo)

**Files:**
- Test: `backend/test/bank-monthly.test.ts` (crear)

`listBankMonthly` (`bank-transactions.service.ts:171-276`) es la lógica más intrincada del módulo —arrastra saldos hacia adelante rellenando meses sin movimiento— y **no tiene un solo test**. La Task 6 la va a tocar. Primero la red.

- [ ] **Step 1: Escribe los tests de caracterización**

Crea `backend/test/bank-monthly.test.ts`. Estos tests describen el comportamiento **actual**; deben pasar sin tocar el código de producción.

```ts
import { beforeEach, afterAll, describe, expect, test } from 'vitest';
import { resetDb, disconnect } from './db';
import {
  makeOrg, makeBankAccount, makeBankTransaction, makeImportBatch,
} from './fixtures';
import { listBankMonthly } from '../src/modules/finance-imports/bank-transactions.service';

// makeBankTransaction (fixtures.ts:77) recibe un OBJETO, no posicionales, y
// exige importBatchId: es FK obligatoria (schema.prisma:791) y no tiene default.
async function movimientosDe(organizationId: string) {
  const lote = await makeImportBatch(organizationId, { type: 'BANK_STATEMENT' });
  return (bankAccountId: string, overrides: Record<string, unknown> = {}) =>
    makeBankTransaction(
      { organizationId, bankAccountId, importBatchId: lote.id },
      overrides,
    );
}

describe('listBankMonthly', () => {
  beforeEach(resetDb);
  afterAll(disconnect);

  test('sin movimientos devuelve vacío', async () => {
    const org = await makeOrg();
    expect(await listBankMonthly({ organizationId: org.id })).toEqual([]);
  });

  test('un mes: flujos y saldo de cierre', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 1000, chargeAmount: 0, balance: 1000,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-20'), creditAmount: 0, chargeAmount: 300, balance: 700,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res).toEqual([
      { month: '2026-07', closingBalance: 700, netFlow: 700, credits: 1000, charges: 300 },
    ]);
  });

  test('devuelve el más reciente primero', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-06-10'), creditAmount: 500, chargeAmount: 0, balance: 500,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-10'), creditAmount: 200, chargeAmount: 0, balance: 700,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res.map((r) => r.month)).toEqual(['2026-07', '2026-06']);
  });

  // El corazón del algoritmo: junio no tiene movimientos, pero su saldo de
  // cierre es el de mayo arrastrado. No es cero.
  test('carry-forward: un mes sin movimientos hereda el saldo anterior', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-05-10'), creditAmount: 900, chargeAmount: 0, balance: 900,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-10'), creditAmount: 100, chargeAmount: 0, balance: 1000,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res.map((r) => [r.month, r.closingBalance, r.netFlow])).toEqual([
      ['2026-07', 1000, 100],
      ['2026-06', 900, 0],   // ← heredado de mayo, sin movimientos propios
      ['2026-05', 900, 900],
    ]);
  });

  // La otra mitad de la regla (el flag `started`, bank-transactions.service.ts:241):
  // antes de su primer movimiento la cuenta aporta 0; el saldo NO se arrastra
  // hacia atrás.
  test('antes del primer movimiento de una cuenta, esa cuenta aporta 0', async () => {
    const org = await makeOrg();
    const vieja = await makeBankAccount(org.id, { accountNumber: '111' });
    const nueva = await makeBankAccount(org.id, { accountNumber: '222' });
    const mov = await movimientosDe(org.id);
    await mov(vieja.id, {
      transactionDate: new Date('2026-06-10'), creditAmount: 500, chargeAmount: 0, balance: 500,
    });
    await mov(nueva.id, {
      transactionDate: new Date('2026-07-10'), creditAmount: 300, chargeAmount: 0, balance: 300,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res.map((r) => [r.month, r.closingBalance])).toEqual([
      ['2026-07', 800],  // 500 (vieja, arrastrado) + 300 (nueva)
      ['2026-06', 500],  // la nueva aún no existe: aporta 0, no 300
    ]);
  });

  test('el saldo de cierre del mes es el del último movimiento, no la suma', async () => {
    const org = await makeOrg();
    const acc = await makeBankAccount(org.id);
    const mov = await movimientosDe(org.id);
    await mov(acc.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 1000, chargeAmount: 0, balance: 1000,
    });
    await mov(acc.id, {
      transactionDate: new Date('2026-07-25'), creditAmount: 0, chargeAmount: 250, balance: 750,
    });
    const res = await listBankMonthly({ organizationId: org.id });
    expect(res[0].closingBalance).toBe(750);
  });

  test('filtra por cuenta', async () => {
    const org = await makeOrg();
    const a = await makeBankAccount(org.id, { accountNumber: '111' });
    const b = await makeBankAccount(org.id, { accountNumber: '222' });
    const mov = await movimientosDe(org.id);
    await mov(a.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 100, chargeAmount: 0, balance: 100,
    });
    await mov(b.id, {
      transactionDate: new Date('2026-07-05'), creditAmount: 900, chargeAmount: 0, balance: 900,
    });
    const res = await listBankMonthly({ bankAccountId: a.id });
    expect(res).toEqual([
      { month: '2026-07', closingBalance: 100, netFlow: 100, credits: 100, charges: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Corre los tests**

```bash
npx vitest run test/bank-monthly.test.ts
```
Expected: PASS, 7 tests, **sin tocar código de producción**.

Si alguno falla, **no cambies el código**: el test describe mal el comportamiento actual. Corrige el test hasta que refleje lo que el código hace hoy. Ese es el punto de una red de caracterización — congela la conducta real, no la deseada.

- [ ] **Step 3: Commit**

```bash
git add backend/test/bank-monthly.test.ts
git commit -m "test(finanzas): red de caracterización de listBankMonthly"
```

---

### Task 6: `periodSeries` absorbe el generador local de meses

**Files:**
- Modify: `backend/src/modules/finance-imports/bank-transactions.service.ts:317-331` (borrar) y `:220` (usar `periodSeries`)

Ojo: la función local `monthRange(min, max)` de `:317` **no es** la `monthRange(month)` de `ledger.ts`. Mismo nombre, cosas distintas: esta genera una *serie* de claves. Es la que `periodSeries` reemplaza.

- [ ] **Step 1: Sustituye la llamada**

En `listBankMonthly`, línea **220**:

```diff
- const months = monthRange(minMonth, maxMonth);
+ const months = periodSeries('month', minMonth, maxMonth);
```

- [ ] **Step 2: Borra la función local**

Borra `monthRange(min, max)` completa (`:317-331`, la que lleva el comentario `/// Lista de meses 'YYYY-MM' contigua entre min y max`).

- [ ] **Step 3: Importa `periodSeries`**

Amplía el import de la Task 4:

```ts
import { listPeriods, periodSeries } from '../shared/period';
```

- [ ] **Step 4: La red de la Task 5 tiene que seguir verde**

```bash
npx vitest run test/bank-monthly.test.ts
```
Expected: PASS, 7 tests. **Aquí es donde la red gana su sueldo**: el carry-forward depende de que la serie de meses sea contigua y ascendente. Si `periodSeries` no es equivalente, el test de "un mes sin movimientos hereda el saldo anterior" se cae.

- [ ] **Step 5: Suite completa y commit**

```bash
npm test
```
Expected: 233 verdes (226 + los 7 de la Task 5).

```bash
git add backend/src/modules/finance-imports/bank-transactions.service.ts
git commit -m "refactor(finanzas): periodSeries absorbe el generador local de meses"
```

---

### Task 7: Las 5 copias inline del parseo mes→rango

**Files:**
- Modify: `backend/src/modules/finance-imports/bank-transactions.service.ts:14-20`, `:289-296`
- Modify: `backend/src/modules/finance/finance-reconciliation.service.ts:19-25`, `:156-159`, `:356-362`

Las cinco hacen `month.split('-').map(Number)` + `Date.UTC` a mano, pese a existir el helper. Todas pasan a `periodRange('month', …)`.

- [ ] **Step 1: `listBankTransactions` (`bank-transactions.service.ts:14-20`)**

```diff
  if (filters.month) {
-   const [y, m] = filters.month.split('-').map(Number);
-   where.transactionDate = {
-     gte: new Date(Date.UTC(y, m - 1, 1)),
-     lt: new Date(Date.UTC(y, m, 1)),
-   };
+   where.transactionDate = periodRange('month', filters.month);
  }
```

`periodRange` devuelve `{ gte, lt }`, que es exactamente la forma que Prisma espera. Amplía el import: `import { listPeriods, periodSeries, periodRange } from '../shared/period';`

- [ ] **Step 2: `listBankByCategory` (`bank-transactions.service.ts:289-296`)**

```diff
  if (filters.month) {
-   const [y, m] = filters.month.split('-').map(Number);
-   const start = new Date(Date.UTC(y, m - 1, 1));
-   const end = new Date(Date.UTC(y, m, 1));
+   const { gte, lt } = periodRange('month', filters.month);
    conditions.push(
-     Prisma.sql`"transactionDate" >= ${start} AND "transactionDate" < ${end}`,
+     Prisma.sql`"transactionDate" >= ${gte} AND "transactionDate" < ${lt}`,
    );
  }
```

- [ ] **Step 3: `getReconciliationSummary` (`finance-reconciliation.service.ts:19-25`)**

```diff
  if (filters.month) {
-   const [y, m] = filters.month.split('-').map(Number);
-   where.transactionDate = {
-     gte: new Date(Date.UTC(y, m - 1, 1)),
-     lt: new Date(Date.UTC(y, m, 1)),
-   };
+   where.transactionDate = periodRange('month', filters.month);
  }
```

Añade `import { periodRange } from '../shared/period';`

- [ ] **Step 4: `autoReconcile` (`finance-reconciliation.service.ts:156-159`)**

```diff
  let range: { gte: Date; lt: Date } | null = null;
  if (month) {
-   const [y, m] = month.split('-').map(Number);
-   range = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
+   range = periodRange('month', month);
  }
```

- [ ] **Step 5: `recognizeTransfers` (`finance-reconciliation.service.ts:356-362`)**

```diff
  if (month) {
-   const [y, m] = month.split('-').map(Number);
-   where.transactionDate = {
-     gte: new Date(Date.UTC(y, m - 1, 1)),
-     lt: new Date(Date.UTC(y, m, 1)),
-   };
+   where.transactionDate = periodRange('month', month);
  }
```

- [ ] **Step 6: Verifica que no queda ninguna copia**

```bash
grep -rn "split('-').map(Number)" backend/src/
```
Expected: **sin resultados**. Si algo aparece, es una sexta copia que el spec no encontró: absórbela igual.

- [ ] **Step 7: Suite completa**

```bash
npm run build && npm test
```
Expected: sin errores, 233 verdes. `finance.service.test.ts` y `finance-imports.service.test.ts` cubren estas rutas: si se ponen rojos, `periodRange` no es equivalente a la copia que sustituyó.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/finance-imports/bank-transactions.service.ts backend/src/modules/finance/finance-reconciliation.service.ts
git commit -m "refactor(finanzas): las 5 copias inline del mes usan periodRange"
```

---

### Task 8: Cierre de la Fase 0

- [ ] **Step 1: Verifica el criterio de la fase**

```bash
git diff develop --stat -- backend/test/
```
Expected: **solo archivos nuevos** (`period.test.ts`, `bank-monthly.test.ts`). Ningún test preexistente modificado. Si `ledger.test.ts` u otro aparece con cambios, la fase incumplió su contrato: revísalo antes de seguir.

- [ ] **Step 2: Suite completa y typecheck**

```bash
npm test && npm run build
```
Expected: 233 verdes, typecheck limpio.

- [ ] **Step 3: Merge a develop**

La Fase 0 es autónoma y no cambia comportamiento: puede mergearse sin esperar a la Fase 1.

```bash
git checkout develop && git merge --no-ff <rama>
```

---

## Chunk 2: Fase 1 — deduplicación correcta

> **Esta fase toca datos reales.** El backfill es el único paso irreversible del trabajo entero. Antes de nada: `pg_dump`.

### Task 9: Diagnóstico — ¿ya se perdió algún ingreso?

**Files:** ninguno (solo consulta).

Antes de escribir una línea de migración hay que saber si el defecto ya causó daño. Ver el spec §2 para el razonamiento.

- [ ] **Step 1: Respalda la BD**

```bash
docker compose exec -T postgres pg_dump -U postgres vitamcore > ~/vitamcore-pre-dedup-$(date +%Y%m%d).sql
```
Expected: un archivo no vacío. **Compruébalo** (`ls -lh`) antes de seguir.

- [ ] **Step 2: Corre el diagnóstico de ventas**

```bash
docker compose exec -T postgres psql -U postgres -d vitamcore -c "
SELECT b.id, b.\"originalFileName\", b.\"periodMonth\",
       b.\"organizationId\" AS org_del_lote,
       i.\"organizationId\" AS org_que_ya_tenia_la_clave,
       r->>'dedupeKey'    AS clave_descartada
  FROM financial_import_batches b
  CROSS JOIN LATERAL jsonb_array_elements(b.\"previewData\") AS r
  JOIN income_records i ON i.\"sourceDedupeKey\" = r->>'dedupeKey'
 WHERE b.status = 'CONFIRMED' AND b.type = 'SALES_REPORT'
   AND b.\"previewData\" IS NOT NULL
   AND jsonb_typeof(b.\"previewData\") = 'array'
   AND r->>'status' = 'DUPLICATE'
   AND i.\"organizationId\" <> b.\"organizationId\";"
```

- [ ] **Step 3: Ídem para compras**

La misma consulta con `expense_records` y `type = 'PURCHASE_REPORT'`.

> Nota sobre el guardia `jsonb_typeof(...) = 'array'`: **no protege al `CROSS JOIN LATERAL`**,
> porque se evalúa después de expandirlo. Si algún lote tuviera `previewData` no-array, la
> consulta erraría en vez de saltárselo. En la práctica da igual —`serializeRows` siempre
> emite un array— pero no hace lo que aparenta: si la query falla con
> `cannot extract elements from an object`, esa es la causa y no un lote corrupto.

- [ ] **Step 4: Interpreta el resultado**

- **`(0 rows)` en ambas** → el defecto nunca causó daño. Sigue a la Task 10.
- **Cualquier fila** → **PÁRATE E INFORMA AL CEO.** Cada fila es un ingreso o gasto que desapareció de sus números. Anota `originalFileName` y `periodMonth` de cada una: son los archivos a reimportar **después** del backfill (con la dedup ya acotada por empresa, esas filas entrarán como nuevas y el resto se marcará duplicado). No sigas sin decírselo: cambia lo que significan sus cifras históricas.

---

### Task 10: `organizationId` en la `dedupeKey`

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.parser.ts` (`parseSalesRows` `:128`, clave `:153-160`; `parsePurchaseRows` `:205`, clave `:223-230`)
- Modify: `backend/src/modules/finance-imports/import-pipeline.service.ts` (`parseRows` `:251-262`, llamada en `:53`)
- Test: `backend/test/finance-imports.parser.test.ts`

> **Esta tarea va antes que el dedupe intra-lote a propósito.** Añade el parámetro
> `organizationId` al parser; si se hiciera al revés, los tests del dedupe tendrían que
> pasar un argumento que aún no existe y el commit intermedio dejaría `npm run build`
> roto (Vitest transpila sin typecheck, así que los tests pasarían y el build no).

- [ ] **Step 1: Escribe el test que falla**

Añade a `backend/test/finance-imports.parser.test.ts`:

```ts
test('la clave de ventas lleva la empresa delante', () => {
  const fila = {
    DOCUMENTO: 'FACTURA', FOLIO: '100', RUT: '76.543.210-9',
    FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
  };
  const a = parseSalesRows([fila], 'org-A').rows[0].dedupeKey;
  const b = parseSalesRows([fila], 'org-B').rows[0].dedupeKey;
  expect(a).toBe('org-A|SALES_REPORT|FACTURA|100|76.543.210-9|2026-07-06|119000');
  // El punto entero del arreglo: la MISMA factura en dos empresas ya no colisiona.
  expect(a).not.toBe(b);
});
```

- [ ] **Step 2: Verifica que falla**

```bash
npx vitest run test/finance-imports.parser.test.ts -t "empresa delante"
```
Expected: FAIL.

- [ ] **Step 3: Añade el parámetro**

- `parseSalesRows(rows, organizationId: string)`: en la `dedupeKey` (`:153-160`), antepón `organizationId` al array.
- `parsePurchaseRows(rows, organizationId: string)`: ídem (`:223-230`).
- `parseBankRows`: **no se toca.** Su unique es `@@unique([bankAccountId, dedupeKey])` y `bankAccountId` ya está acotado a una empresa.
- `parseRows` (`import-pipeline.service.ts:251-262`): propaga `organizationId` a los dos primeros.
- En `previewImport`, la llamada a `parseRows` está en **`:53`**: pásale `input.organizationId`.

**No añadas un filtro `organizationId` a `getExistingDedupeKeys`.** Con la empresa dentro de la clave, su `where: { sourceDedupeKey: { in: dedupeKeys } }` queda acotado por empresa gratis: las claves de otra empresa ya no pueden coincidir. Añadirlo sería redundante y haría creer que hacían falta dos arreglos.

- [ ] **Step 4: Arregla los tests que este cambio rompe**

Están **todos en `test/finance-imports.parser.test.ts`**, no en `finance-imports.service.test.ts` (ese escribe `previewData` a mano y nunca llama al parser, así que no se entera):

- `:70`, `:100`, `:117` — llamadas `parseSalesRows([...])` / `parsePurchaseRows([...])` con un solo argumento: dejan de compilar. Pásales un `organizationId` cualquiera (`'org-1'`).
- `:93-95`, `:139-141` — aserciones de `dedupeKey` hardcodeadas: antepón `org-1|` al valor esperado.
- `:168` — la de `parseBankRows` **no cambia** (`acc-1|2026-01-30|…`): ese parser no lleva empresa.

```bash
npx vitest run test/finance-imports.parser.test.ts && npm run build
```
Expected: PASS y typecheck limpio.

- [ ] **Step 5: El test de la pérdida silenciosa (el que justifica la fase)**

Añade a `backend/test/finance-imports.service.test.ts`:

```ts
test('dos empresas con la misma factura: ambas se guardan', async () => {
  // Antes de este arreglo, getExistingDedupeKeys (sin filtro de empresa) marcaba
  // la segunda como DUPLICATE en el preview y confirmImport la descartaba: el
  // ingreso desaparecía de los números sin aviso. Ver spec §2.
  const orgA = await makeOrg('Vitam Healthcare');
  const orgB = await makeOrg('Vitam Tech');
  const fila = {
    DOCUMENTO: 'FACTURA', FOLIO: '100', RUT: '76.543.210-9',
    FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
  };

  // CLAVE: las dedupeKey se DERIVAN del parser, no se escriben a mano. Si las
  // escribieras a mano ya saldrían distintas y el test pasaría incluso sin el
  // arreglo: probaría que dos strings distintos insertan dos filas, que es
  // cierto hoy. Lo que se prueba aquí es que el PARSER las hace distintas.
  for (const org of [orgA, orgB]) {
    const preview = parseSalesRows([fila], org.id);
    const lote = await makeImportBatch(org.id, {
      type: 'SALES_REPORT',
      previewData: serializeRows(preview.rows),
    });
    await confirmImport(lote.id);
  }

  expect(await prisma.incomeRecord.count()).toBe(2); // antes del arreglo: 1
});
```

Importa `parseSalesRows` del parser y `serializeRows` de `finance-imports.serde.ts`. El resto del andamiaje (`makeImportBatch`, `confirmImport`) sigue el patrón de `describe('confirmImport (ventas)')` (`:116`).

- [ ] **Step 6: Verifica y commitea**

```bash
npm test && npm run build
```

```bash
git add backend/src/modules/finance-imports/ backend/test/
git commit -m "fix(finanzas): la dedupeKey de ventas y compras lleva organizationId"
```

---

### Task 11: Dedupe intra-lote

**Files:**
- Modify: `backend/src/modules/finance-imports/finance-imports.parser.ts` (`parseSalesRows` `:128`, `parsePurchaseRows` `:205`, `parseBankRows` `:260`)
- Test: `backend/test/finance-imports.parser.test.ts`

El preview dedupea contra la BD pero no contra sí mismo: dos filas idénticas en un archivo quedan ambas `VALID` y chocan en el confirm, abortando el lote entero con un 25P02.

- [ ] **Step 1: Escribe los tests que fallan**

```ts
test('dos filas idénticas: la segunda se marca DUPLICATE', () => {
  const fila = {
    DOCUMENTO: 'FACTURA', FOLIO: '100', RUT: '76.543.210-9',
    FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
  };
  const res = parseSalesRows([fila, { ...fila }], 'org-1');
  expect(res.rows[0].status).toBe('VALID');
  expect(res.rows[1].status).toBe('DUPLICATE');
  expect(res.rows[1].dedupeKey).toBe(res.rows[0].dedupeKey);
});

test('filas distintas no se marcan duplicadas', () => {
  const base = {
    DOCUMENTO: 'FACTURA', RUT: '76.543.210-9',
    FECHA: '2026-07-06', TOTAL: '119000', EMITIDO: 'SI',
  };
  const res = parseSalesRows(
    [{ ...base, FOLIO: '100' }, { ...base, FOLIO: '101' }],
    'org-1',
  );
  expect(res.rows.map((r) => r.status)).toEqual(['VALID', 'VALID']);
});
```

- [ ] **Step 2: Verifica que falla**

```bash
npx vitest run test/finance-imports.parser.test.ts -t "idénticas"
```
Expected: FAIL — la segunda fila sale `VALID`.

- [ ] **Step 3: Implementa el dedupe intra-lote**

En `finance-imports.parser.ts`, tras construir las filas y **antes** de `buildPreview`, en cada uno de los tres parsers:

```ts
// Dedupe intra-lote: el preview solo compara contra la BD (getExistingDedupeKeys),
// así que dos filas idénticas dentro del MISMO archivo llegarían ambas al insert
// y abortarían la transacción entera (25P02). La primera gana; las repetidas se
// marcan aquí, donde el CEO las ve y las entiende.
const vistas = new Set<string>();
const deduped = parsedRows.map((row) => {
  if (row.status === 'ERROR') return row;
  if (vistas.has(row.dedupeKey)) {
    return { ...row, status: 'DUPLICATE' as const };
  }
  vistas.add(row.dedupeKey);
  return row;
});
```

Y pasa `deduped` a `buildPreview` en vez de `parsedRows`.

Las filas `ERROR` se saltan a propósito: ya están descartadas y su `dedupeKey` puede estar incompleta (falta folio o RUT), así que no deben reservar la clave.

- [ ] **Step 4: Verifica y commitea**

```bash
npm test && npm run build
```
Expected: verde.

```bash
git add backend/src/modules/finance-imports/finance-imports.parser.ts backend/test/finance-imports.parser.test.ts
git commit -m "fix(finanzas): dedupe intra-lote en el preview"
```

---

### Task 12: El confirm deja de mentir

**Files:**
- Modify: `backend/src/modules/finance-imports/import-pipeline.service.ts:425-432` y `:131-133`

El `catch` de P2002 devuelve `false` para "saltar" el duplicado, pero corre dentro de `prisma.$transaction`: en Postgres la transacción ya está abortada (25P02) y la fila siguiente falla igual. El `catch` promete una resiliencia que no puede cumplir.

- [ ] **Step 1: Sustituye el `catch`**

En `createRow` (`:425-432`):

```diff
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
-     return false;
+     // No se puede "saltar" una fila dentro de una transacción: en Postgres la
+     // sentencia fallida ya la abortó (25P02) y Prisma no pone savepoint por
+     // query, así que este catch nunca pudo cumplir lo que prometía. El
+     // rollback del lote es lo correcto —la importación es atómica—; lo que
+     // estaba mal era la falsa promesa y morir con un código críptico.
+     throw badRequest(`Fila duplicada en el lote: ${row.dedupeKey}`);
    }
    throw error;
  }
```

**`createRow` sigue devolviendo `boolean`. No lo cambies a `void`.** Hay un **segundo** `return false` en `:401` (`if (!batch.bankAccountId) return false;`) que no tiene nada que ver con P2002: es la guarda de un lote bancario sin cuenta. Si quitaras el booleano y con él el `if (created) inserted += 1; else duplicated += 1;` de `confirmImport` (`:145-150`), ese caso se contaría como insertado sin haber insertado nada. Es inalcanzable hoy (`previewImport` llama a `assertBankAccount`), pero no es esta tarea la que debe decidir sobre él: tocar solo el camino del P2002 deja el cambio acotado a lo que se está arreglando.

`badRequest` ya está importado en el archivo.

- [ ] **Step 2: Añade la rama de lotes obsoletos**

En `confirmImport` (`:131-133`), antes de la guarda genérica:

```ts
if (batch.status === FinancialImportStatus.FAILED) {
  throw badRequest(
    'Este lote quedó obsoleto por una actualización del sistema; vuelve a subir el archivo',
  );
}
```

La Task 13 cierra los lotes en `PREVIEW` que sobrevivan a la migración, y sin esta rama el CEO recibiría "El lote ya fue confirmado", que es falso y desconcertante.

- [ ] **Step 3: Actualiza el test que caracteriza el 25P02 — y NO cambies lo que afirma**

El test es **`test/finance-imports.service.test.ts:167`** (`'dedupe: un sourceDedupeKey ya existente aborta la transacción y confirmImport falla'`, dentro de `describe('confirmImport (ventas)')`). **No es el `:229`**, que prueba otra cosa (un lote ya confirmado no se reconfirma).

Y ojo con la premisa: **el dedupe intra-lote de la Task 11 NO previene este escenario.** El test crea un `incomeRecord` preexistente en BD con `sourceDedupeKey: 'sale-dup'` y luego arma `previewData` **a mano**, sin pasar por el parser. Es una colisión contra la BD, no dentro del lote. Sigue siendo alcanzable si alguien confirma un preview obsoleto.

Así que el test **debe seguir rechazando**. Lo que cambia es *cómo*: antes moría con `prisma:error 25P02`, ahora lanza un `badRequest` legible. Aprovecha para afinarlo:

```diff
- await expect(imports.confirmImport(batch.id)).rejects.toThrow();
+ await expect(imports.confirmImport(batch.id)).rejects.toThrow(/Fila duplicada en el lote/);
```

Y reescribe su comentario (`:168-172`), que hoy describe el defecto como comportamiento esperado:

```ts
// Una clave ya existente en BD hace fallar el insert. La transacción hace
// rollback completo (la importación es atómica) pero ahora con un mensaje
// legible en vez del 25P02 críptico de antes: createRow ya no finge que
// puede "saltar" la fila.
```

- [ ] **Step 4: Corrige la cabecera del archivo de tests**

`test/finance-imports.service.test.ts:10-15` documenta la mentira que acabas de borrar:

```diff
- // El dedupe real se produce por el @unique global de `sourceDedupeKey`
- // (IncomeRecord/ExpenseRecord): un choque lanza P2002 y createRow lo cuenta
- // como duplicado (no inserta).
+ // El dedupe real ocurre en el PREVIEW (getExistingDedupeKeys contra la BD, y
+ // el dedupe intra-lote del parser): confirmImport solo inserta lo que llega
+ // marcado VALID/WARNING. El @unique de `sourceDedupeKey` es la última red: si
+ // salta, el lote entero hace rollback con un badRequest legible.
```

Un comentario que describe el bug como si fuera el diseño es cómo el bug sobrevive a su propio arreglo.

- [ ] **Step 5: Verifica**

```bash
npm test && npm run build
```
Expected: verde, y **sin `prisma:error 25P02` en la salida**. Esa línea desapareciendo del log es la señal de que el defecto murió.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/finance-imports/import-pipeline.service.ts backend/test/finance-imports.service.test.ts
git commit -m "fix(finanzas): confirm honesto ante duplicados, sin 25P02"
```

---

### Task 13: La migración — backfill y lotes colgados

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_dedupe_key_por_empresa/migration.sql`

- [ ] **Step 1: Crea la migración vacía**

```bash
cd backend && npx prisma migrate dev --create-only --name dedupe_key_por_empresa
```
(No hay cambios de esquema: es solo datos. `--create-only` evita que Prisma la aplique antes de escribirla.)

- [ ] **Step 2: Escribe el SQL**

```sql
-- Prefija las dedupeKey existentes con la empresa. Ver spec §2.
--
-- No puede violar el unique POR CONSTRUCCIÓN: los cuid no contienen '|', así
-- que orgA|K1 = orgB|K2 exige orgA=orgB y K1=K2, que es justo lo que el unique
-- global ya impedía. Y los espacios de claves viejo (SALES_REPORT|…) y nuevo
-- (<cuid>|…) son disjuntos, así que tampoco hay colisión transitoria durante
-- el UPDATE.
--
-- El guardia NOT LIKE la hace re-ejecutable: las claves viejas empiezan siempre
-- por SALES_REPORT|/PURCHASE_REPORT|, nunca por un cuid, y los cuid no llevan
-- los comodines % ni _ de LIKE, así que la comparación es literal.

UPDATE income_records
   SET "sourceDedupeKey" = "organizationId" || '|' || "sourceDedupeKey"
 WHERE "sourceDedupeKey" IS NOT NULL
   AND "sourceDedupeKey" NOT LIKE "organizationId" || '|%';

UPDATE expense_records
   SET "sourceDedupeKey" = "organizationId" || '|' || "sourceDedupeKey"
 WHERE "sourceDedupeKey" IS NOT NULL
   AND "sourceDedupeKey" NOT LIKE "organizationId" || '|%';

-- Lotes colgados en PREVIEW: confirmImport reproduce las dedupeKey congeladas
-- en previewData, así que un lote previo al despliegue insertaría claves SIN
-- prefijo que el backfill ya no alcanza — invisibles para siempre a la dedup.
-- Un PREVIEW es un archivo subido y no confirmado: no hay ninguna fila suya en
-- la BD y volver a subirlo cuesta diez segundos.
UPDATE financial_import_batches SET status = 'FAILED' WHERE status = 'PREVIEW';
```

- [ ] **Step 3: Aplícala en local**

```bash
npx prisma migrate dev
```

- [ ] **Step 4: Verifica el backfill**

```bash
docker compose exec -T postgres psql -U postgres -d vitamcore -c "
SELECT count(*) FILTER (WHERE \"sourceDedupeKey\" LIKE 'SALES_REPORT|%'
                          OR \"sourceDedupeKey\" LIKE 'PURCHASE_REPORT|%') AS sin_prefijo,
       count(*) FILTER (WHERE \"sourceDedupeKey\" IS NOT NULL) AS con_clave,
       count(*) AS total
  FROM income_records;"
```
Expected: `sin_prefijo = 0`, y `total` **idéntico al de antes de la migración** (el backfill reescribe claves, no inserta ni borra). Repite con `expense_records`.

- [ ] **Step 5: Verifica la idempotencia**

Corre los dos `UPDATE` a mano una segunda vez:

```bash
docker compose exec -T postgres psql -U postgres -d vitamcore -c "
UPDATE income_records SET \"sourceDedupeKey\" = \"organizationId\" || '|' || \"sourceDedupeKey\"
 WHERE \"sourceDedupeKey\" IS NOT NULL AND \"sourceDedupeKey\" NOT LIKE \"organizationId\" || '|%';"
```
Expected: `UPDATE 0`. Si toca alguna fila, el guardia no funciona: **párate**, estarías duplicando prefijos.

- [ ] **Step 6: BD de test y suite**

```bash
npm run test:db:setup && npm test
```
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/migrations/
git commit -m "fix(finanzas): backfill de dedupeKey por empresa y cierre de lotes colgados"
```

---

### Task 14: Cierre de la Fase 1

- [ ] **Step 1: Suite completa y typecheck**

```bash
npm test && npm run build
```
Expected: verde, sin `25P02` en la salida.

- [ ] **Step 2: Verificación de extremo a extremo**

Usa el skill `@verify`: levanta la app, sube un archivo de ventas real, confirma, y comprueba que las filas entran y que reimportar el mismo archivo las marca todas duplicadas sin reventar.

Esto no es opcional: los tests cubren el parser y el service, pero nadie ha ejercido el flujo completo con un XLSX de verdad desde que cambió la `dedupeKey`.

- [ ] **Step 3: Informa antes de desplegar**

Resume al CEO: el resultado del diagnóstico (Task 9), qué tocó el backfill, y —si hubo filas perdidas— qué archivos hay que reimportar y qué cifras históricas van a cambiar.

**No despliegues al VPS sin ese visto bueno.** `deploy.sh` corre `prisma migrate deploy` sin ventana de confirmación: en producción el backfill se aplica solo, y sobre las finanzas reales.
