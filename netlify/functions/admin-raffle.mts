import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, RaffleError, canManageRaffles, getAdminRaffleDetail, updateTarget } from '../../server/raffles';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { UpdateRaffleRequest } from '../../shared/api';

/**
 * GET   /api/admin/raffles/:id -> rifa + historial completo de ganadores. Solo ADMIN con cuenta autorizada (403 para otros Admin).
 * PATCH /api/admin/raffles/:id -> { winningPosition } cambia qué salida gana, o { targetWinners } cuántas salidas se buscan
 *                                  (solo abierta y por encima de lo ya sorteado).
 * No existe DELETE ni «reiniciar»: los resultados no se borran.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed('GET, PATCH');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  const id = context.params.id ?? '';
  if (!id) return apiError('Esa rifa no existe.', 404);

  try {
    if (req.method === 'GET') {
      const d = await getAdminRaffleDetail(id);
      return d ? json(d) : apiError('Esa rifa no existe.', 404);
    }
    let body: Partial<UpdateRaffleRequest>;
    try {
      body = (await req.json()) as Partial<UpdateRaffleRequest>;
    } catch {
      return apiError('Solicitud inválida.');
    }
    return json(await updateTarget(auth.user.id, id, { targetWinners: body?.targetWinners, winningPosition: body?.winningPosition }));
  } catch (err) {
    if (err instanceof RaffleError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffles/:id' };
