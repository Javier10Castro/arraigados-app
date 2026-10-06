import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { retireAnnouncement } from '../../server/announcements';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/** POST /api/admin/announcements/:id/retire -- retira un aviso (publicado o programado). Solo ADMIN. */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  const id = context.params.id ?? '';
  if (!id) return apiError('Ese aviso no existe.', 404);
  const result = await retireAnnouncement(id, auth.user.id);
  if (result.outcome === 'not_found') return apiError('Ese aviso no existe.', 404);
  return json(result);
});

export const config: Config = { path: '/api/admin/announcements/:id/retire' };
