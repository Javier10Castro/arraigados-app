import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { listRedemptions, redemptionsCatalog } from '../../server/redemptions';
import { handler, json, methodNotAllowed } from '../../server/http';
import { parsePageSize, type RedemptionStatus } from '../../shared/api';

/**
 * GET /api/admin/redemptions          -> lista filtrada y paginada (Etapa 6, parte Admin)
 * GET /api/admin/redemptions/catalog  -> Staff que aparece en el filtro
 * Solo ADMIN (igual patrón que admin-attendees.mts).
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const url = new URL(req.url);
  if (url.pathname.endsWith('/catalog')) {
    return json(await redemptionsCatalog());
  }
  const s = url.searchParams;
  const status = s.get('status');
  return json(
    await listRedemptions({
      q: s.get('q') ?? '',
      manualCode: s.get('manualCode') ?? '',
      status: status === 'VALIDO' || status === 'ANULADO' ? (status as RedemptionStatus) : '',
      staffId: s.get('staffId') ?? '',
      from: s.get('from') ?? '',
      to: s.get('to') ?? '',
      page: Number(s.get('page') ?? 0),
      pageSize: parsePageSize(s.get('pageSize')),
    }),
  );
});

export const config: Config = { path: ['/api/admin/redemptions', '/api/admin/redemptions/catalog'] };
