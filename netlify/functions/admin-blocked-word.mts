import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { BlockedWordError, removeBlockedWord, updateBlockedWord } from '../../server/blockedWords';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * DELETE /api/admin/blocked-words/:id           -> quita una palabra de la lista del Admin.
 * PATCH  /api/admin/blocked-words/:id { word }  -> cambia su texto (corregir un error de dedo).
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') return methodNotAllowed('DELETE, PATCH');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Esa palabra no existe.', 404);
  if (req.method === 'PATCH') {
    let body: { word?: unknown };
    try {
      body = (await req.json()) as { word?: unknown };
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const r = await updateBlockedWord(auth.user.id, id, body.word);
      if (r.outcome === 'not_found') return apiError('Esa palabra ya no está en la lista.', 404);
      if (r.outcome === 'exists') return apiError('Esa palabra ya estaba en la lista.', 409);
      return json(r);
    } catch (err) {
      if (err instanceof BlockedWordError) return apiError(err.message, 400);
      throw err;
    }
  }
  const result = await removeBlockedWord(auth.user.id, id);
  if (result.outcome === 'not_found') return apiError('Esa palabra ya no está en la lista.', 404);
  return json(result);
});

export const config: Config = { path: '/api/admin/blocked-words/:id' };
