import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { TeamDiscountError, TeamDiscountForbidden, getTeamDiscountSummary, setTeamDiscount } from '../../server/teamDiscount';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { UpdateTeamDiscountRequest } from '../../shared/api';

/**
 * GET /api/admin/team-discounts -- resumen + reglas (cualquier ADMIN; solo lectura).
 * PUT /api/admin/team-discounts -- guarda UNA regla (STAFF o ADMIN). Solo las cuentas de DISCOUNT_EDITORS:
 * el permiso sale del correo de la SESIÓN (cookie), nunca de lo que mande el navegador. Cualquier otro Admin: 403.
 * Es una simulación: no toca precios, canjes ni saldos.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'PUT') return methodNotAllowed('GET, PUT');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') return json(await getTeamDiscountSummary(auth.user.email));

  let body: Partial<UpdateTeamDiscountRequest>;
  try {
    body = (await req.json()) as Partial<UpdateTeamDiscountRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    await setTeamDiscount({ id: auth.user.id, email: auth.user.email }, { role: body?.role, type: body?.type, amount: body?.amount });
    return json(await getTeamDiscountSummary(auth.user.email));
  } catch (err) {
    if (err instanceof TeamDiscountForbidden) return apiError(err.message, 403);
    if (err instanceof TeamDiscountError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/team-discounts' };
