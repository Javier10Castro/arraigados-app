import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { listAudit } from '../../server/audit';
import { handler, json, methodNotAllowed } from '../../server/http';
import { parsePageSize } from '../../shared/api';
import type { AuditCategory } from '../../shared/audit';

/**
 * GET /api/admin/audit -> bitácora (AuditLog) con filtros y paginación. Solo ADMIN,
 * solo lectura (Etapa 8). Mismo patrón que admin-notes.mts.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

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
    }),
  );
});

export const config: Config = { path: '/api/admin/audit' };
