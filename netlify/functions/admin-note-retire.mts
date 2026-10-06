import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { NoteRetireError, retireNoteAsAdmin } from '../../server/notes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { RetireNoteRequest } from '../../shared/api';

/**
 * POST /api/admin/notes/:id/retire { reason } -- el Admin retira una nota activa
 * (moderación). La nota queda Vencida, no se borra, y se registra en AuditLog.
 * Solo ADMIN; el actor sale SIEMPRE de la sesión firmada, nunca del cuerpo.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Esa nota no existe.', 404);

  let body: RetireNoteRequest;
  try {
    body = (await req.json()) as RetireNoteRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }

  try {
    const result = await retireNoteAsAdmin(id, auth.user.id, body.reason);
    if (result.outcome === 'not_found') return apiError('Esa nota no existe.', 404);
    return json(result);
  } catch (err) {
    if (err instanceof NoteRetireError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/notes/:id/retire' };
