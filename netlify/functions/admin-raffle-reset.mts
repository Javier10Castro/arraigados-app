import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, RaffleError, canManageRaffles } from '../../server/raffles';
import { resetRaffles } from '../../server/raffleReset';
import { RULES, guardUser } from '../../server/rateLimit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { ResetRafflesRequest } from '../../shared/api';

/**
 * POST /api/admin/raffle-reset { packageId: '<id del kit>' | 'ALL', confirm: 'BORRAR' }
 * Borra las rifas, salidas/ganadores e inscripciones de ese kit (o de todos) para empezar de cero. NO se puede deshacer.
 * Solo ADMIN con cuenta autorizada de Rifas; queda en la auditoría (raffle.reset).
 */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  const blocked = await guardUser(RULES.admin_danger, auth.user.id);
  if (blocked) return blocked;

  let body: Partial<ResetRafflesRequest>;
  try {
    body = (await req.json()) as Partial<ResetRafflesRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await resetRaffles(auth.user.id, { packageId: body?.packageId, confirm: body?.confirm }));
  } catch (err) {
    if (err instanceof RaffleError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffle-reset' };
