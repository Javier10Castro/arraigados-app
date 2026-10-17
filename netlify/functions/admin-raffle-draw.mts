import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, RaffleError, canManageRaffles, drawWinner } from '../../server/raffles';
import { RULES, guardUser } from '../../server/rateLimit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { DrawRaffleRequest } from '../../shared/api';

/**
 * POST /api/admin/raffles/:id/draw  { drawKey, extra? } -> sortea UN ganador en el servidor. Solo ADMIN con cuenta autorizada (403 para otros Admin).
 * `drawKey` (8-64 caracteres) hace el sorteo idempotente: el mismo drawKey devuelve el mismo ganador (replay: true).
 * `extra: true` = sorteo extra autorizado, solo con la rifa ya completada.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  const id = context.params.id ?? '';
  if (!id) return apiError('Esa rifa no existe.', 404);
  const blocked = await guardUser(RULES.raffle_draw, auth.user.id);
  if (blocked) return blocked;

  let body: Partial<DrawRaffleRequest>;
  try {
    body = (await req.json()) as Partial<DrawRaffleRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await drawWinner(auth.user.id, id, { drawKey: body?.drawKey, extra: body?.extra }));
  } catch (err) {
    if (err instanceof RaffleError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffles/:id/draw' };
