import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema';

export async function listCategories(includeInactive: boolean) {
  return prisma.bankCategory.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/// Slug ASCII en mayúsculas a partir del nombre, con sufijo si colisiona.
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'CATEGORIA';
}

export async function createCategory(input: CreateCategoryInput) {
  const baseKey = slugify(input.name);
  let key = baseKey;
  let n = 1;
  // Asegura unicidad del key.
  while (await prisma.bankCategory.findUnique({ where: { key }, select: { key: true } })) {
    n += 1;
    key = `${baseKey}_${n}`;
  }
  return prisma.bankCategory.create({
    data: {
      key,
      name: input.name,
      kind: input.kind,
      sortOrder: input.sortOrder ?? 999,
    },
  });
}

export async function updateCategory(key: string, input: UpdateCategoryInput) {
  const current = await prisma.bankCategory.findUnique({ where: { key }, select: { key: true } });
  if (!current) throw notFound('Categoría no encontrada');
  return prisma.bankCategory.update({ where: { key }, data: input });
}

export async function deleteCategory(key: string) {
  const [txCount, ruleCount] = await Promise.all([
    prisma.bankTransaction.count({ where: { category: key } }),
    prisma.bankCategoryRule.count({ where: { categoryKey: key } }),
  ]);
  if (txCount > 0 || ruleCount > 0) {
    throw badRequest('Categoría en uso: desactívala en vez de borrarla');
  }
  await prisma.bankCategory.delete({ where: { key } });
  return { ok: true };
}
