import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { PresenceError, getThread, listConversations, markRead, sendMessage } from '../../server/adminPresence';
import { RULES, guardUser } from '../../server/rateLimit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET  /api/admin/messages                         -> mis conversaciones (una por persona).
 * GET  /api/admin/messages?with=<userId>[&before=]  -> historial con esa persona (marca leídos sus mensajes hacia mí).
 * POST /api/admin/messages       { toUserId, body } -> manda un mensaje corto a otra cuenta Admin.
 * POST /api/admin/messages/read  { ids }            -> marca como leídos MIS mensajes.
 * Solo ADMIN. Mandar tiene su propio límite (admin_msg).
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed('GET, POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (req.method === 'GET') {
    if (context.params?.action) return apiError('Ruta inválida.', 404);
    const url = new URL(req.url);
    const withId = url.searchParams.get('with');
    try {
      return json(withId === null ? await listConversations(auth.user) : await getThread(auth.user, withId, url.searchParams.get('before') ?? undefined));
    } catch (err) {
      if (err instanceof PresenceError) return apiError(err.message, err.status);
      throw err;
    }
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    if (context.params?.action === 'read') return json(await markRead(auth.user, body?.ids));
    if (context.params?.action) return apiError('Ruta inválida.', 404);
    const blocked = await guardUser(RULES.admin_msg, auth.user.id);
    if (blocked) return blocked;
    return json(await sendMessage(auth.user, { toUserId: body?.toUserId, body: body?.body }), 201);
  } catch (err) {
    if (err instanceof PresenceError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: ['/api/admin/messages', '/api/admin/messages/:action'] };
