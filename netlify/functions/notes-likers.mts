import type { Config } from '@netlify/functions';
import { listMyNoteLikers } from '../../server/notes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/** GET /api/notes/likers -- personas que le dieron like a MI nota vigente (identidad por x-pulse-token). */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const r = await listMyNoteLikers(req.headers.get(PULSE_TOKEN_HEADER) ?? '');
  if (!r.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: 'not_found' });
  return json({ likers: r.likers });
});

export const config: Config = { path: '/api/notes/likers' };
