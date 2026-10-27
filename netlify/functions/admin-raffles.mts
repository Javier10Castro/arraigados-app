import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, RaffleError, canManageRaffles, createRaffle, listAdminRaffles } from '../../server/raffles';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { CreateRaffleRequest } from '../../shared/api';

/**
 * GET  /api/admin/raffles -> rifas (todas las ediciones) + kits. Solo ADMIN con cuenta autorizada (403 para otros Admin).
 * POST /api/admin/raffles -> abre una rifa nueva (edición siguiente del kit). Solo ADMIN con cuenta autorizada (403 para otros Admin).
 * Ningún método sortea ni borra nada.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  if (req.method === 'GET') return json(await listAdminRaffles());

  let body: Partial<CreateRaffleRequest>;
  try {
    body = (await req.json()) as Partial<CreateRaffleRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await createRaffle(auth.user.id, { packageId: body?.packageId, targetWinners: body?.targetWinners, winningPosition: body?.winningPosition, name: body?.name }), 201);
  } catch (err) {
    if (err instanceof RaffleError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffles' };
