import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { AuditClearError, canClearAudit, clearAudit, listAudit } from '../../server/audit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { parsePageSize } from '../../shared/api';
import type { AuditCategory } from '../../shared/audit';

/**
 * GET /api/admin/audit -> bitácora (AuditLog) con filtros y paginación. Solo ADMIN,
 * lectura (Etapa 8) + DELETE para vaciarla. Mismo patrón que admin-notes.mts.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') return methodNotAllowed('GET, DELETE');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  // DELETE { confirm: 'BORRAR BITACORA' } -> vacía la bitácora (deja una entrada que lo registra).
  if (req.method === 'DELETE') {
    if (!canClearAudit(auth.user.email)) return apiError('No tienes permiso para vaciar la bitácora.', 403);
    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    try {
      return json(await clearAudit(auth.user.id, body.confirm ?? ''));
    } catch (err) {
      if (err instanceof AuditClearError) return apiError(err.message, 400);
      throw err;
    }
  }

  const s = new URL(req.url).searchParams;
  return json(
    await listAudit({
      q: s.get('q') ?? '',
      category: (s.get('category') ?? '') as AuditCategory | '',
      actorId: s.get('actorId') ?? '',
      from: s.get('from') ?? '',
      to: s.get('to') ?? '',
      page: Number(s.get('page') ?? 0),
      pageSize: parsePageSize(s.get('pageSize')),
    }, auth.user.email),
  );
});

export const config: Config = { path: '/api/admin/audit' };
