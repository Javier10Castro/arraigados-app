import type { Config, Context } from '@netlify/functions';
import { toggleNoteLike } from '../../server/notes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * POST /api/notes/:id/like -- alterna el like del dueño de la pulsera a esa
 * nota. Identidad resuelta por x-pulse-token (igual que el resto de
 * endpoints del asistente), nunca por un id que mande el cliente.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const id = context.params.id ?? '';
  if (!id) return apiError('Esa nota no existe.', 404);

  const token = req.headers.get(PULSE_TOKEN_HEADER) ?? '';
  const result = await toggleNoteLike(token, id);
  if (!result.ok) {
    if (result.reason === 'own_note') return apiError('No puedes darle like a tu propia nota.', 403);
    return result.reason === 'note_not_found'
      ? apiError('Esa nota no existe.', 404)
      : apiError('Esta pulsera no tiene una sesión activa.', 401, { status: 'not_found' });
  }
  return json({ liked: result.liked, likeCount: result.likeCount });
});

export const config: Config = { path: '/api/notes/:id/like' };
