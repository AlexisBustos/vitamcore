/**
 * Enlace de registros manuales con Cliente/Proveedor.
 *
 * La importación enlaza por RUT (clave única `(organizationId, rut)`). Los
 * registros creados a mano desde los formularios solo traen el nombre, así que
 * aquí enlazamos por nombre dentro de la empresa: si ya existe un cliente o
 * proveedor con ese nombre (p. ej. creado por una importación previa) lo
 * reutilizamos; si no, lo creamos usando el nombre como RUT provisional (la
 * clave única exige rut). Así los acumulados por cliente/proveedor también
 * reflejan los movimientos cargados a mano, no solo los importados.
 */
import { prisma } from '../../lib/prisma';

export async function resolveClientId(
  organizationId: string,
  name: string | null | undefined,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const existing = await prisma.client.findFirst({
    where: { organizationId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await prisma.client.create({
      data: { organizationId, name: trimmed, rut: trimmed },
      select: { id: true },
    });
    return created.id;
  } catch {
    // Carrera o colisión del RUT provisional: reintenta la búsqueda por nombre.
    const again = await prisma.client.findFirst({
      where: { organizationId, name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    });
    return again?.id ?? null;
  }
}

export async function resolveVendorId(
  organizationId: string,
  name: string | null | undefined,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const existing = await prisma.vendor.findFirst({
    where: { organizationId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await prisma.vendor.create({
      data: { organizationId, name: trimmed, rut: trimmed },
      select: { id: true },
    });
    return created.id;
  } catch {
    const again = await prisma.vendor.findFirst({
      where: { organizationId, name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    });
    return again?.id ?? null;
  }
}
