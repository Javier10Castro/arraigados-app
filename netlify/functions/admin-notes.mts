import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { listNotesAdmin } from '../../server/notes';
import { handler, json, methodNotAllowed } from '../../server/http';
import { parsePageSize, type AdminNoteStatus, type AdminNotesLikesFilter, type AdminNotesSort } from '../../shared/api';

/**
 * GET /api/admin/notes -> lista de Notas con filtros, orden y paginación (solo
 * lectura). Solo ADMIN, mismo patrón que admin-redemptions.mts.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const s = new URL(req.url).searchParams;
  const status = s.get('status');
  const likes = s.get('likes');
  const sort = s.get('sort');
  return json(
    await listNotesAdmin({
      q: s.get('q') ?? '',
      status: status === 'ACTIVA' || status === 'VENCIDA' ? (status as AdminNoteStatus) : '',
      zoneId: s.get('zoneId') ?? '',
      presbyteryId: s.get('presbyteryId') ?? '',
      churchId: s.get('churchId') ?? '',
      likes: likes === 'with' || likes === 'without' ? (likes as AdminNotesLikesFilter) : '',
      from: s.get('from') ?? '',
      to: s.get('to') ?? '',
      sort: (sort === 'likes' ? 'likes' : 'recent') as AdminNotesSort,
      page: Number(s.get('page') ?? 0),
      pageSize: parsePageSize(s.get('pageSize')),
    }),
  );
});

export const config: Config = { path: '/api/admin/notes' };
