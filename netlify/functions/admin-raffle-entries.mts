import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, canManageRaffles } from '../../server/raffles';
import { RaffleEntryError, listEntries, setEntriesOpen } from '../../server/raffleEntries';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { UpdateRaffleEntriesRequest } from '../../shared/api';

/**
 * GET   /api/admin/raffle-entries -> quién entró a cada rifa (por kit) con sus 3 respuestas, y si las inscripciones están abiertas.
 * PATCH /api/admin/raffle-entries { open } -> abre o cierra las inscripciones (queda en la auditoría).
 * Solo ADMIN con cuenta autorizada de Rifas (las mismas que sortean). No existe DELETE: las inscripciones no se borran.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed('GET, PATCH');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  if (req.method === 'GET') return json(await listEntries(), 200, { 'cache-control': 'no-store' });

  let body: Partial<UpdateRaffleEntriesRequest>;
  try {
    body = (await req.json()) as Partial<UpdateRaffleEntriesRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    const open = await setEntriesOpen(auth.user.id, body?.open);
    return json({ entriesOpen: open });
  } catch (err) {
    if (err instanceof RaffleEntryError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffle-entries' };
