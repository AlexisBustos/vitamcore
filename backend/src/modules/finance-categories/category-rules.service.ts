import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import {
  categorizeWith,
  normalizeText,
  type RuleDirection,
} from '../finance-imports/finance-imports.categories';
import type { CreateRuleInput, UpdateRuleInput } from './category-rules.schema';

/// Reglas activas ordenadas por priority asc (forma que consume categorizeWith).
/// Desempate por createdAt para que el first-match-wins sea determinista si dos
/// reglas comparten priority (posible tras re-seed con reglas de usuario).
export async function getActiveRules() {
  return prisma.bankCategoryRule.findMany({
    where: { active: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { categoryKey: true, matchText: true, direction: true },
  });
}

export async function listRules() {
  return prisma.bankCategoryRule.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
}

async function assertCategoryExists(categoryKey: string) {
  const cat = await prisma.bankCategory.findUnique({
    where: { key: categoryKey },
    select: { key: true },
  });
  if (!cat) throw badRequest('La categoría indicada no existe');
}

/// Recalcula la categoría de los movimientos NO fijados a mano con las reglas
/// vigentes. Idempotente; persiste solo los que cambian, en una transacción.
/// Devuelve cuántos cambiaron.
export async function reapplyRules() {
  const rules = await getActiveRules();
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { id: true, description: true, chargeAmount: true, category: true },
  });
  const ops = [];
  for (const t of txs) {
    const next = categorizeWith(rules, t.description, t.chargeAmount > 0);
    if (next !== t.category) {
      ops.push(prisma.bankTransaction.update({ where: { id: t.id }, data: { category: next } }));
    }
  }
  if (ops.length > 0) await prisma.$transaction(ops);
  return { updated: ops.length };
}

export async function createRule(input: CreateRuleInput) {
  await assertCategoryExists(input.categoryKey);
  const max = await prisma.bankCategoryRule.aggregate({ _max: { priority: true } });
  const priority = (max._max.priority ?? -1) + 1; // se agrega al final
  let rule;
  try {
    rule = await prisma.bankCategoryRule.create({
      data: {
        categoryKey: input.categoryKey,
        matchText: normalizeText(input.matchText), // no trimea: preserva centinelas de espacio
        direction: (input.direction ?? 'ANY') as RuleDirection,
        priority,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw badRequest('Ya existe una regla con ese texto y dirección');
    }
    throw e;
  }
  const { updated } = await reapplyRules();
  return { rule, recategorized: updated };
}

export async function updateRule(id: string, input: UpdateRuleInput) {
  const current = await prisma.bankCategoryRule.findUnique({ where: { id } });
  if (!current) throw notFound('Regla no encontrada');
  if (input.categoryKey) await assertCategoryExists(input.categoryKey);
  let rule;
  try {
    rule = await prisma.bankCategoryRule.update({
      where: { id },
      data: {
        categoryKey: input.categoryKey,
        matchText: input.matchText !== undefined ? normalizeText(input.matchText) : undefined,
        direction: input.direction as RuleDirection | undefined,
        active: input.active,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw badRequest('Ya existe una regla con ese texto y dirección');
    }
    throw e;
  }
  const { updated } = await reapplyRules();
  return { rule, recategorized: updated };
}

export async function deleteRule(id: string) {
  const current = await prisma.bankCategoryRule.findUnique({ where: { id } });
  if (!current) throw notFound('Regla no encontrada');
  await prisma.bankCategoryRule.delete({ where: { id } });
  const { updated } = await reapplyRules();
  return { recategorized: updated };
}

export async function reorderRules(ids: string[]) {
  // `priority` es puro orden de evaluación (sin bandas): se reescribe 0..n-1
  // según el orden recibido. La idempotencia del seed no depende de priority
  // (usa el unique compuesto), así que renumerar libremente es seguro.
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.bankCategoryRule.update({ where: { id }, data: { priority: i } }),
    ),
  );
  const { updated } = await reapplyRules();
  return { recategorized: updated };
}

/// Cuenta movimientos NO fijados cuya descripción contiene matchText (con la
/// dirección dada). Ignora la prioridad de otras reglas: es una aproximación
/// "cuántos contienen este texto", rotulada ~N en la UI.
export async function previewRule(matchText: string, direction: RuleDirection) {
  const needle = normalizeText(matchText);
  const txs = await prisma.bankTransaction.findMany({
    where: { categoryManual: false },
    select: { description: true, chargeAmount: true },
  });
  let count = 0;
  for (const t of txs) {
    const isCharge = t.chargeAmount > 0;
    if (direction === 'CHARGE' && !isCharge) continue;
    if (direction === 'CREDIT' && isCharge) continue;
    if (normalizeText(t.description).includes(needle)) count += 1;
  }
  return { count };
}
