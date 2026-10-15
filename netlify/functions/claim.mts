import type { Config, Context } from '@netlify/functions';
import { ValidationError, claimPulse } from '../../server/attendee';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, ipScope, record, scope } from '../../server/rateLimit';
import { QR_TOKEN_RE, type ClaimRequest } from '../../shared/api';

/**
 * POST /api/claim -- registra al asistente y reclama la pulsera (atómico).
 * Límites (server/rateLimit.ts): claim_ip (volumen por IP, holgado: el recinto comparte IP), claim_token (reintentos sobre la
 * misma pulsera) y tok_miss_ip (cuenta SOLO las pulseras inexistentes: adivinar QR). No sustituye la reclamación atómica.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  let body: ClaimRequest;
  try {
    body = (await req.json()) as ClaimRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  const ip = ipScope(context);
  const token = String(body?.token ?? '');
  const blocked = await guard([
    { rule: RULES.claim_ip, id: ip },
    { rule: RULES.tok_miss_ip, id: ip, inc: 0 },
    ...(QR_TOKEN_RE.test(token) ? [{ rule: RULES.claim_token, id: scope('tok', token) }] : []),
  ]);
  if (blocked) return blocked;
  try {
    const result = await claimPulse(body);
    if (result.outcome === 'not_found') await record([{ rule: RULES.tok_miss_ip, id: ip }]);
    return json(result);
  } catch (err) {
    if (err instanceof ValidationError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/claim' };
