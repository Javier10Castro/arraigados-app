import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { attendeesCatalog, listAttendees } from '../../server/attendees';
import { handler, json, methodNotAllowed } from '../../server/http';
import { parsePageSize, type DrinksFilter } from '../../shared/api';

/**
 * GET /api/admin/attendees          -> lista filtrada y paginada (Etapa 4)
 * GET /api/admin/attendees/catalog  -> zonas, presbiterios, iglesias y kits para los filtros
 * Solo ADMIN.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const url = new URL(req.url);
  if (url.pathname.endsWith('/catalog')) {
    return json(await attendeesCatalog());
  }
  const s = url.searchParams;
  const drinks = s.get('drinks');
  return json(
    await listAttendees({
      q: s.get('q') ?? '',
      zoneId: s.get('zoneId') ?? '',
      presbyteryId: s.get('presbyteryId') ?? '',
      churchId: s.get('churchId') ?? '',
      packageId: s.get('packageId') ?? '',
      drinks: drinks === 'available' || drinks === 'exhausted' || drinks === 'none' ? (drinks as DrinksFilter) : '',
      page: Number(s.get('page') ?? 0),
      pageSize: parsePageSize(s.get('pageSize')),
    }),
  );
});

export const config: Config = { path: ['/api/admin/attendees', '/api/admin/attendees/catalog'] };
