import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, withAttendeeLimit } from '../../server/rateLimit';
import { ProfileError, attendeeIdForToken, getProfiles } from '../../server/profile';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * POST /api/profiles { ids: string[] } -> { profiles: { [attendeeId]: { kind, avatarId, initialsId, photoUrl } } }
 * Perfiles de varias personas a la vez, para dibujar sus avatares (notas, likes, listas del panel).
 * Solo para quien tiene sesión: un asistente con pulsera activa (x-pulse-token) o el staff (cookie).
 * Solo devuelve a quienes personalizaron su perfil, y de cada persona solo lo ACTIVO (la propia ve todo).
 * Las fotos van con URL firmada que caduca.
 */
export default handler(async (req: Request, context: Context) =>
  withAttendeeLimit(req, context, RULES.att_profiles, async () => {
    if (req.method !== 'POST') return methodNotAllowed('POST');

    const token = req.headers.get(PULSE_TOKEN_HEADER) ?? '';
    const asAttendee = token ? await attendeeIdForToken(token) : null;
    if (!asAttendee) {
      const auth = await authorize(req, ['ADMIN', 'STAFF']);
      if ('response' in auth) return auth.response;
    }

    let body: { ids?: unknown };
    try {
      body = (await req.json()) as { ids?: unknown };
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      return json({ profiles: await getProfiles(body.ids, asAttendee) });
    } catch (err) {
      if (err instanceof ProfileError) return apiError(err.message, err.status);
      throw err;
    }
  }),
);

export const config: Config = { path: '/api/profiles' };
