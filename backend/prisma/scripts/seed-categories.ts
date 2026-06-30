import { prisma } from '../../src/lib/prisma';
import { normalizeText } from '../../src/modules/finance-imports/finance-imports.categories';

// 10 categorías iniciales (key estable, name visible, kind, orden de display).
const CATEGORIES: { key: string; name: string; kind: 'INCOME' | 'EXPENSE' | 'NEUTRAL'; sortOrder: number }[] = [
  { key: 'VENTAS', name: 'Ventas / Recaudación', kind: 'INCOME', sortOrder: 1 },
  { key: 'FONASA', name: 'Fonasa / Prestaciones', kind: 'INCOME', sortOrder: 2 },
  { key: 'TRANSFER_IN', name: 'Transferencias recibidas', kind: 'INCOME', sortOrder: 3 },
  { key: 'HONORARIOS', name: 'Honorarios / Sueldos', kind: 'EXPENSE', sortOrder: 4 },
  { key: 'PROVEEDORES', name: 'Proveedores', kind: 'EXPENSE', sortOrder: 5 },
  { key: 'COMBUSTIBLE', name: 'Combustible', kind: 'EXPENSE', sortOrder: 6 },
  { key: 'IMPUESTOS', name: 'Impuestos', kind: 'EXPENSE', sortOrder: 7 },
  { key: 'CREDITOS', name: 'Créditos / Deuda', kind: 'EXPENSE', sortOrder: 8 },
  { key: 'COMISIONES', name: 'Comisiones bancarias', kind: 'EXPENSE', sortOrder: 9 },
  { key: 'TRASPASO_INTERNO', name: 'Traspaso entre cuentas', kind: 'NEUTRAL', sortOrder: 10 },
];

// Reglas en el MISMO orden de evaluación que el array RULES hardcodeado.
// priority = índice (asc). direction 'ANY' salvo PROVEEDORES ('CHARGE').
// matchText se guarda normalizado; ' iva' conserva su espacio inicial.
const RULES: { categoryKey: string; matchText: string; direction: 'CHARGE' | 'CREDIT' | 'ANY' }[] = [
  { categoryKey: 'TRASPASO_INTERNO', matchText: 'traspaso a cuenta:', direction: 'ANY' },
  { categoryKey: 'TRASPASO_INTERNO', matchText: 'traspaso de cuenta:', direction: 'ANY' },
  { categoryKey: 'FONASA', matchText: 'fonasa', direction: 'ANY' },
  { categoryKey: 'VENTAS', matchText: 'deposito en efectivo', direction: 'ANY' },
  { categoryKey: 'VENTAS', matchText: 'banchile pagos', direction: 'ANY' },
  { categoryKey: 'TRANSFER_IN', matchText: 'traspaso de:', direction: 'ANY' },
  { categoryKey: 'COMBUSTIBLE', matchText: 'copec', direction: 'ANY' },
  { categoryKey: 'CREDITOS', matchText: 'pago de credito', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: 'sii', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: 'tesoreria', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: 'ppm', direction: 'ANY' },
  { categoryKey: 'IMPUESTOS', matchText: ' iva', direction: 'ANY' }, // espacio inicial deliberado
  { categoryKey: 'IMPUESTOS', matchText: 'impto', direction: 'ANY' },
  { categoryKey: 'COMISIONES', matchText: 'comision', direction: 'ANY' },
  { categoryKey: 'COMISIONES', matchText: 'mantencion', direction: 'ANY' },
  { categoryKey: 'COMISIONES', matchText: 'impuesto cheques', direction: 'ANY' },
  { categoryKey: 'HONORARIOS', matchText: 'traspaso a:', direction: 'ANY' },
  { categoryKey: 'PROVEEDORES', matchText: 'pago:', direction: 'CHARGE' },
];

async function main() {
  for (const c of CATEGORIES) {
    await prisma.bankCategory.upsert({
      where: { key: c.key },
      update: { name: c.name, kind: c.kind, sortOrder: c.sortOrder },
      create: c,
    });
  }

  // Reglas: idempotentes por el unique compuesto (categoryKey, matchText,
  // direction). upsert NO borra nada → re-ejecutar el seed nunca toca las
  // reglas creadas por el CEO. En `update` se deja {} para no pisar priority/
  // active si el CEO ya las ajustó; en `create` priority = índice (las del seed
  // quedan primero por su orden bajo; priority no es único, los empates son
  // inofensivos).
  let priority = 0;
  for (const r of RULES) {
    const matchText = normalizeText(r.matchText); // preserva ' iva' (no trimea)
    await prisma.bankCategoryRule.upsert({
      where: {
        categoryKey_matchText_direction: {
          categoryKey: r.categoryKey,
          matchText,
          direction: r.direction,
        },
      },
      update: {},
      create: { categoryKey: r.categoryKey, matchText, direction: r.direction, priority, active: true },
    });
    priority += 1;
  }
  console.log(`Sembradas ${CATEGORIES.length} categorías y ${RULES.length} reglas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
