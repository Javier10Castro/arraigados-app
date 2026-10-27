import type { Config, Context } from '@netlify/functions';
import { RaffleEntryError, getMyRaffle, submitEntry } from '../../server/raffleEntries';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, withAttendeeLimit } from '../../server/rateLimit';
import { PULSE_TOKEN_HEADER } from '../../shared/api';

/**
 * GET  /api/raffle-entry -> la rifa del asistente: su kit, si ya se inscribió (con sus respuestas) y el resultado.
 * POST /api/raffle-entry { liked, plenary, lesson } -> se inscribe a la rifa de SU kit (una sola vez; repetir no cambia nada).
 * Identidad: x-pulse-token (pulsera ACTIVE de asistente). El kit sale de la pulsera, nunca del navegador.
 * Las cuentas del equipo (vista de visitante) no participan: sin token -> 401.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');
  const rule = req.method === 'GET' ? RULES.att_raffle_r : RULES.att_raffle_w;
  return withAttendeeLimit(req, context, rule, async () => {
    const token = req.headers.get(PULSE_TOKEN_HEADER) ?? '';
    const noSession = () => apiError('Esta pulsera no tiene una sesión activa.', 401, { status: 'not_found' });
    if (req.method === 'GET') {
      const mine = await getMyRaffle(token);
      return mine ? json(mine, 200, { 'cache-control': 'no-store' }) : noSession();
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const mine = await submitEntry(token, body);
      return mine ? json(mine) : noSession();
    } catch (err) {
      if (err instanceof RaffleEntryError) return apiError(err.message, err.status);
      throw err;
    }
  });
});

export const config: Config = { path: '/api/raffle-entry' };
