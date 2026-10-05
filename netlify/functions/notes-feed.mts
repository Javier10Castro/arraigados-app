import type { Config } from '@netlify/functions';
import { listNotesFeed } from '../../server/notes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * GET /api/notes/feed -- carrusel de /home: notas públicas y vigentes de OTROS
 * asistentes (primer nombre + id para el avatar; nunca datos personales).
 * Identidad por x-pulse-token, igual que /api/notes.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const result = await listNotesFeed(req.headers.get(PULSE_TOKEN_HEADER) ?? '');
  if (!result.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: result.status });
  return json({ notes: result.notes });
});

export const config: Config = { path: '/api/notes/feed' };
