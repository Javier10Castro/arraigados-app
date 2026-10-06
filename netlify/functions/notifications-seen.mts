import type { Config } from '@netlify/functions';
import { markNotificationsSeen } from '../../server/announcements';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/** POST /api/notifications/seen -- el asistente abrió la campana: lo publicado hasta ahora queda como leído. */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const r = await markNotificationsSeen(req.headers.get(PULSE_TOKEN_HEADER) ?? '');
  if (!r.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: r.status });
  return json({ ok: true });
});

export const config: Config = { path: '/api/notifications/seen' };
