import type { Config } from '@netlify/functions';
import { getMe } from '../../server/attendee';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * GET /api/me -- datos del asistente. Credencial: el token de su pulsera en
 * la cabecera x-pulse-token (no en la URL, para que no quede en historiales).
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const result = await getMe(req.headers.get(PULSE_TOKEN_HEADER) ?? '');
  if (!result.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: result.status });
  return json(result.me);
});

export const config: Config = { path: '/api/me' };
