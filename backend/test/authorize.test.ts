import { describe, expect, test, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireRole, allowRoles } from '../src/middleware/authorize';
import { ADMIN_ROLES, ALL_ROLES } from '../src/modules/shared/roles';

// Construye una request simulada con un usuario de cierto rol y método.
function mockReq(role: string | undefined, method = 'GET'): Request {
  return { method, user: role ? { id: 'u1', name: 'U', email: 'u@t', role } : undefined } as unknown as Request;
}
const res = {} as Response;

// Ejecuta el middleware y devuelve el argumento con que se llamó a next().
function run(mw: (req: Request, res: Response, next: NextFunction) => void, req: Request) {
  const next = vi.fn();
  mw(req, res, next);
  return next.mock.calls[0]?.[0]; // undefined = permitido; error = bloqueado
}

describe('requireRole', () => {
  test('permite si el rol está en la lista', () => {
    expect(run(requireRole(...ADMIN_ROLES), mockReq('ADMIN'))).toBeUndefined();
  });
  test('bloquea con 403 si el rol no está en la lista', () => {
    const err = run(requireRole(...ADMIN_ROLES), mockReq('COLABORADOR'));
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
  });
  test('bloquea con 401 si no hay usuario', () => {
    const err = run(requireRole(...ADMIN_ROLES), mockReq(undefined));
    expect(err.statusCode).toBe(401);
  });
});

describe('allowRoles (lectura vs escritura)', () => {
  const mw = allowRoles({ read: ALL_ROLES, write: ADMIN_ROLES });
  test('COLABORADOR puede GET', () => {
    expect(run(mw, mockReq('COLABORADOR', 'GET'))).toBeUndefined();
  });
  test('COLABORADOR NO puede POST (403)', () => {
    expect(run(mw, mockReq('COLABORADOR', 'POST')).statusCode).toBe(403);
  });
  test('ADMIN puede POST', () => {
    expect(run(mw, mockReq('ADMIN', 'POST'))).toBeUndefined();
  });
});
