import type { ApiError } from '../shared/api';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function apiError(message: string, status = 400, extra: Partial<ApiError> = {}) {
  return json({ error: message, ...extra } satisfies ApiError, status);
}

export function methodNotAllowed(allowed: string) {
  return json({ error: 'Método no permitido.' } satisfies ApiError, 405, { allow: allowed });
}

/** Envuelve una función: errores inesperados -> 500 con mensaje genérico (el detalle va al log). */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error('[api]', err);
      const message =
        err instanceof Error && /DATABASE_URL|PUBLIC_BASE_URL/.test(err.message)
          ? err.message
          : 'Ocurrió un error en el servidor. Intenta de nuevo en un momento.';
      return apiError(message, 500);
    }
  };
}
