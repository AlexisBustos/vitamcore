/**
 * Cliente HTTP centralizado.
 * - Adjunta credenciales (cookie de sesión) en cada petición.
 * - Normaliza el manejo de errores en una única clase ApiError.
 */
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      (body && (body.error as string)) || `Error ${res.status}`;
    throw new ApiError(res.status, message, body?.details);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Construye un query string a partir de filtros (omite vacíos). */
export function toQuery(
  params: Record<string, string | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}
