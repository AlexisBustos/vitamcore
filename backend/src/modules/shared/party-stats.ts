/**
 * Piezas compartidas por los servicios de Cliente y Proveedor (parties).
 *
 * Ambos repiten la misma forma en sus funciones de listado/detalle y solo
 * divergen en el modelo Prisma (`client`/`vendor`), la relación de documentos
 * (`incomes`/`expenses`), el `statsSelect` y la función `computeStats`. Aquí se
 * extrae el boilerplate común (referencia de organización, `where` de búsqueda,
 * orden de listado, args del detalle y el guard de "no encontrado") para que
 * cada servicio mantenga solo su cálculo de acumulados.
 */
import { notFound } from '../../utils/http-error';

/** Referencia mínima de la organización incluida en cada party. */
export const orgRef = { select: { id: true, name: true } };

/**
 * Construye el `where` de listado: filtra por organización y, si hay búsqueda,
 * por nombre o RUT (case-insensitive). Compatible con `Client`/`Vendor` porque
 * ambos exponen `organizationId`, `name` y `rut`.
 */
export function buildPartyWhere(
  organizationId: string | undefined,
  search: string | undefined,
) {
  return {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { rut: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

/** Orden de listado compartido: por organización y luego por nombre. */
export function partyListOrderBy() {
  return [{ organizationId: 'asc' as const }, { name: 'asc' as const }];
}

/**
 * Args de la relación de documentos (ingresos/gastos) en el detalle: los más
 * recientes primero, acotados a 300 filas.
 */
export function partyDocumentsDetailArgs() {
  return {
    orderBy: [
      { sourceIssueDate: 'desc' as const },
      { createdAt: 'desc' as const },
    ],
    take: 300,
  };
}

/** Devuelve la party o lanza 404 con el mensaje del dominio. */
export function requireParty<T>(party: T | null, message: string): T {
  if (!party) throw notFound(message);
  return party;
}
