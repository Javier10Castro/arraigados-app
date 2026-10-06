import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { ChurchError, deleteChurch, updateChurch } from '../../server/churches';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { ChurchInput } from '../../shared/api';

/**
 * PATCH  /api/admin/churches/:id { name, presbyteryId } -> renombra y/o mueve de presbiterio (solo uno)
 * DELETE /api/admin/churches/:id                        -> elimina (solo si no tiene asistentes)
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed('PATCH, DELETE');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Esa iglesia no existe.', 404);

  try {
    if (req.method === 'DELETE') {
      await deleteChurch(auth.user.id, id);
      return json({ ok: true });
    }
    let body: Partial<ChurchInput>;
    try {
      body = (await req.json()) as Partial<ChurchInput>;
    } catch {
      return apiError('Solicitud inválida.');
    }
    await updateChurch(auth.user.id, id, body);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof ChurchError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/churches/:id' };
