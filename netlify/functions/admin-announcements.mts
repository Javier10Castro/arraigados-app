import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { AnnouncementError, createAnnouncement, listAnnouncementsAdmin } from '../../server/announcements';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { parsePageSize } from '../../shared/api';
import type { AnnouncementStatus, CreateAnnouncementRequest } from '../../shared/notifications';

/**
 * GET  /api/admin/announcements?status=&page=&pageSize= -> avisos del equipo
 * POST /api/admin/announcements { title, body, audience, publishAt? } -> crea (ahora o programado)
 * Solo ADMIN; el autor sale de la sesión firmada.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') {
    const s = new URL(req.url).searchParams;
    const status = s.get('status');
    return json(
      await listAnnouncementsAdmin({
        status: status === 'PROGRAMADO' || status === 'PUBLICADO' || status === 'RETIRADO' ? (status as AnnouncementStatus) : '',
        page: Number(s.get('page') ?? 0),
        pageSize: parsePageSize(s.get('pageSize')),
      }),
    );
  }

  let body: Partial<CreateAnnouncementRequest>;
  try {
    body = (await req.json()) as Partial<CreateAnnouncementRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await createAnnouncement(auth.user.id, body));
  } catch (err) {
    if (err instanceof AnnouncementError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/announcements' };
