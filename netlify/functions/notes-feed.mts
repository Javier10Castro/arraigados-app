import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { listNotesFeed, listNotesFeedForTeam } from '../../server/notes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, withAttendeeLimit } from '../../server/rateLimit';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * GET /api/notes/feed -- carrusel de /home: notas públicas y vigentes de OTROS
 * asistentes (primer nombre + id para el avatar; nunca datos personales).
 * Identidad por x-pulse-token, igual que /api/notes.
 *
 * Sin x-pulse-token: vista de visitante de una cuenta del EQUIPO (solo lectura). Exige la cookie `arr_staff` válida
 * (authorize); una pulsera enviada pero inválida sigue dando 401 y NUNCA cae a esta ruta.
 */
export default handler(async (req: Request, context: Context) =>
  withAttendeeLimit(req, context, RULES.att_feed, async () => {
    if (req.method !== 'GET') return methodNotAllowed('GET');
    const tokenHeader = req.headers.get(PULSE_TOKEN_HEADER);
    if (tokenHeader === null || tokenHeader === '') {
      const auth = await authorize(req);
      if ('response' in auth) return auth.response;
      return json({ notes: await listNotesFeedForTeam() });
    }
    const result = await listNotesFeed(tokenHeader);
    if (!result.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: result.status });
    return json({ notes: result.notes });
  }),
);

export const config: Config = { path: '/api/notes/feed' };
