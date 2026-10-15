import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { reassignPulse } from '../../server/staff';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guardUser } from '../../server/rateLimit';
import type { ReassignRequest } from '../../shared/api';

/**
 * POST /api/staff/reassign -- reemplazar la pulsera de un asistente (Staff o
 * Admin). La actual queda deshabilitada (INVALIDATED) y la nueva activa para el
 * mismo asistente, con las aguas frescas ya canjeadas. Ver server/staff.ts.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const blocked = await guardUser(RULES.staff_reassign, auth.user.id);
  if (blocked) return blocked;
  let body: ReassignRequest;
  try {
    body = (await req.json()) as ReassignRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  return json(await reassignPulse(body.manualCode, body.newToken, auth.user.id));
});

export const config: Config = { path: '/api/staff/reassign' };
