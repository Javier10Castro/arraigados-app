import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RAFFLE_FORBIDDEN, canManageRaffles } from '../../server/raffles';
import { RaffleEntryError, setEntryRemoved } from '../../server/raffleEntries';
import { RULES, guardUser } from '../../server/rateLimit';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { UpdateRaffleEntryRequest } from '../../shared/api';

/**
 * PATCH /api/admin/raffle-entries/:packageId/:attendeeId { removed: true|false }
 *   true  = quitar a la persona de la rifa de ese kit (no entra al sorteo ni puede volver a inscribirse).
 *   false = restaurarla.
 * No borra respuestas ni ganadores; queda en la auditoría. Solo ADMIN con cuenta autorizada de Rifas. Devuelve la lista
 * de inscritos actualizada (misma forma que GET /api/admin/raffle-entries).
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'PATCH') return methodNotAllowed('PATCH');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!canManageRaffles(auth.user.email)) return apiError(RAFFLE_FORBIDDEN, 403);
  const blocked = await guardUser(RULES.admin_danger, auth.user.id);
  if (blocked) return blocked;

  let body: Partial<UpdateRaffleEntryRequest>;
  try {
    body = (await req.json()) as Partial<UpdateRaffleEntryRequest>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await setEntryRemoved(auth.user.id, context.params.packageId ?? '', context.params.attendeeId ?? '', body?.removed));
  } catch (err) {
    if (err instanceof RaffleEntryError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/raffle-entries/:packageId/:attendeeId' };
