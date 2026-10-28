import type { Config, Context } from '@netlify/functions';
import { getPublicRaffle } from '../../server/raffles';
import { RULES, guard, ipScope } from '../../server/rateLimit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/raffle/:id -> estado público de UNA rifa para el proyector (/rifa/:id). Sin sesión.
 * Devuelve solo: nombre del kit, conteos, cada salida y quienes siguen participando (`pool`, para la animación), siempre como
 * nombre + inicial del apellido («Ana A.»). NUNCA apellidos completos, ids de personas ni contacto. El id de la rifa es el «enlace» del proyector; no se puede sortear desde aquí.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const blocked = await guard([{ rule: RULES.raffle_public, id: ipScope(context) }]);
  if (blocked) return blocked;
  const r = await getPublicRaffle(context.params.id ?? '');
  if (!r) return apiError('Esa rifa no existe.', 404);
  return json(r, 200, { 'cache-control': 'no-store' });
});

export const config: Config = { path: '/api/raffle/:id' };
