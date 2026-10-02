import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { DashboardError, getDashboard, parseFilters } from '../../server/dashboard';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/admin/dashboard?period=&zoneId=&presbyteryId=&churchId=&packageId=
 * Dashboard operativo (Etapa 7). Solo ADMIN, solo lectura: la sesión y el rol
 * se revalidan aquí en el servidor (authorize), no basta con ocultar la pantalla.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  try {
    const filters = parseFilters(new URL(req.url).searchParams);
    return json(await getDashboard(filters));
  } catch (err) {
    if (err instanceof DashboardError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/dashboard' };
