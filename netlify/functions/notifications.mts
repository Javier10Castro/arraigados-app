import type { Config } from '@netlify/functions';
import { listNotifications } from '../../server/announcements';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/** GET /api/notifications -- campana de /home: avisos publicados para tu zona. Identidad por x-pulse-token. */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const r = await listNotifications(req.headers.get(PULSE_TOKEN_HEADER) ?? '');
  if (!r.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: r.status });
  return json(r.data);
});

export const config: Config = { path: '/api/notifications' };
