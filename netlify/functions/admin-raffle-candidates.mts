import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, canManageRaffles } from '../../server/raffles';
import { RaffleEntryError, searchCandidates } from '../../server/raffleEntries';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/admin/raffle-candidates?q=<nombre o iglesia> -> asistentes registrados (pulsera activa) para «Agregar persona»
 * en Admin → Rifas, con el kit de su pulsera y si ya están en la rifa. Máximo 20. Solo cuentas autorizadas de Rifas.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  try {
    return json(await searchCandidates(new URL(req.url).searchParams.get('q')));
  } catch (err) {
    if (err instanceof RaffleEntryError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffle-candidates' };
