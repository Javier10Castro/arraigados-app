import type { Config } from '@netlify/functions';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { ProfileError, attendeeIdForToken, getProfile, saveProfile } from '../../server/profile';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * GET /api/profile -> cómo eligió mostrarse el asistente { profile | null }.
 * PUT /api/profile -> guarda su elección (multipart/form-data: kind = photo | avatar | initials,
 *                     avatarId, initialsId, photo (JPEG), removePhoto). 429 + Retry-After si cambia demasiado seguido.
 * Credencial: el token de su pulsera (x-pulse-token). El asistente NUNCA manda su id: sale del token,
 * así que solo puede leer/cambiar su propio perfil.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'PUT') return methodNotAllowed('GET, PUT');
  const attendeeId = await attendeeIdForToken(req.headers.get(PULSE_TOKEN_HEADER) ?? '');
  if (!attendeeId) return apiError('Esta pulsera no tiene una sesión activa.', 401);

  if (req.method === 'GET') return json({ profile: await getProfile(attendeeId) });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json({ profile: await saveProfile(attendeeId, form) });
  } catch (err) {
    if (err instanceof ProfileError) return json({ error: err.message }, err.status, err.retryAfter ? { 'retry-after': String(err.retryAfter) } : {});
    throw err;
  }
});

export const config: Config = { path: '/api/profile' };
