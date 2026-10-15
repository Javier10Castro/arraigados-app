import type { Config, Context } from '@netlify/functions';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, scope, withAttendeeLimit } from '../../server/rateLimit';
import { ProfileError, attendeeIdForToken, getProfile, saveProfile } from '../../server/profile';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * GET /api/profile -> cómo eligió mostrarse el asistente { profile | null }.
 * PUT /api/profile -> guarda su elección (multipart/form-data: kind = photo | avatar | initials,
 *                     avatarId, initialsId, photo (JPEG), removePhoto). 429 + Retry-After si cambia demasiado seguido.
 * Credencial: el token de su pulsera (x-pulse-token). El asistente NUNCA manda su id: sale del token,
 * así que solo puede leer/cambiar su propio perfil.
 *
 * Límites (server/rateLimit.ts), por pulsera: lectura 60/min, cambios 10 / 10 min y subir foto 5 / 10 min (este último se
 * consulta ANTES de procesar el archivo). Además sigue el enfriamiento propio de saveProfile (10 s con foto, 2 s sin ella).
 * Las validaciones de la foto (tipo, tamaño, dimensiones, JPEG real) siguen en server/profile.ts: el límite no las sustituye.
 */
export default handler(async (req: Request, context: Context) =>
  withAttendeeLimit(req, context, req.method === 'PUT' ? RULES.att_profile_w : RULES.att_profile_r, async () => {
    if (req.method !== 'GET' && req.method !== 'PUT') return methodNotAllowed('GET, PUT');
    const token = req.headers.get(PULSE_TOKEN_HEADER) ?? '';
    const attendeeId = await attendeeIdForToken(token);
    if (!attendeeId) return apiError('Esta pulsera no tiene una sesión activa.', 401);

    if (req.method === 'GET') return json({ profile: await getProfile(attendeeId) });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError('Solicitud inválida.');
    }
    const photo = form.get('photo');
    if (photo instanceof File && photo.size > 0) {
      const blocked = await guard([{ rule: RULES.att_photo, id: scope('tok', token) }]);
      if (blocked) return blocked;
    }
    try {
      return json({ profile: await saveProfile(attendeeId, form) });
    } catch (err) {
      if (err instanceof ProfileError) return json({ error: err.message }, err.status, err.retryAfter ? { 'retry-after': String(err.retryAfter) } : {});
      throw err;
    }
  }),
);

export const config: Config = { path: '/api/profile' };
