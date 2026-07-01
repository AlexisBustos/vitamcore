/**
 * Enlace de registros con Cliente/Proveedor, unificado en `resolveParty`.
 *
 * Dos caminos según los datos disponibles:
 *  - Import: hay RUT -> upsert por la clave única `(organizationId, rut)`.
 *  - Manual: solo nombre (formularios) -> se enlaza por nombre dentro de la
 *    empresa; si ya existe un cliente/proveedor con ese nombre (p. ej. creado
 *    por una importación previa) lo reutiliza; si no, lo crea usando el nombre
 *    como RUT provisional (la clave única exige rut). Así los acumulados por
 *    cliente/proveedor reflejan también los movimientos cargados a mano.
 *
 * Acepta un cliente Prisma opcional (`db`) para poder ejecutarse dentro de un
 * `$transaction` (import) sobre el cliente transaccional `tx` y preservar la
 * atomicidad: si la transacción hace rollback, la parte creada también se
 * revierte.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

type PartyModel = 'client' | 'vendor';
type Db = Prisma.TransactionClient | typeof prisma;

export async function resolveParty(
  args: {
    model: PartyModel;
    organizationId: string;
    rut?: string | null;
    name?: string | null;
  },
  db: Db = prisma,
): Promise<string | null> {
  const { model, organizationId } = args;
  const rut = args.rut?.trim();
  const name = args.name?.trim();
  const delegate = (model === 'client' ? db.client : db.vendor) as typeof prisma.client;

  // Camino import: hay RUT -> upsert por (org, rut). Idéntico a upsertClient/upsertVendor.
  if (rut) {
    const row = await delegate.upsert({
      where: { organizationId_rut: { organizationId, rut } },
      create: { organizationId, rut, name: name ?? rut },
      update: name ? { name } : {},
      select: { id: true },
    });
    return row.id;
  }

  // Camino manual: solo nombre -> find/create por nombre (idéntico al resolveClientId actual).
  if (!name) return null;
  const existing = await delegate.findFirst({
    where: { organizationId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await delegate.create({
      data: { organizationId, name, rut: name },
      select: { id: true },
    });
    return created.id;
  } catch {
    // Carrera o colisión del RUT provisional: reintenta la búsqueda por nombre.
    const again = await delegate.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    return again?.id ?? null;
  }
}

export function resolveClientId(
  organizationId: string,
  name: string | null | undefined,
) {
  return resolveParty({ model: 'client', organizationId, name });
}

export function resolveVendorId(
  organizationId: string,
  name: string | null | undefined,
) {
  return resolveParty({ model: 'vendor', organizationId, name });
}
