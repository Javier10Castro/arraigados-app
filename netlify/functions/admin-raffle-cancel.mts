import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, RaffleError, cancelRaffle, canManageRaffles } from '../../server/raffles';
import { RULES, guardUser } from '../../server/rateLimit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * POST /api/admin/raffles/:id/cancel -> cancela una rifa ABIERTA (migración 016). Solo ADMIN con cuenta autorizada (403 para otros Admin).
 * No borra nada: los ganadores y el historial se conservan. Una rifa cancelada no se sortea, edita ni reabre.
 * Segunda cancelación / rifa completada: 409. Sin la migración 016: 409 con mensaje claro.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  const id = context.params.id ?? '';
  if (!id) return apiError('Esa rifa no existe.', 404);
  const blocked = await guardUser(RULES.admin_user_w, auth.user.id);
  if (blocked) return blocked;
  try {
    return json(await cancelRaffle(auth.user.id, id));
  } catch (err) {
    if (err instanceof RaffleError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffles/:id/cancel' };
