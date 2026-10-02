import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { redeemOne } from '../../server/staff';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { RedeemRequest } from '../../shared/api';

/**
 * POST /api/staff/redeem -- descuenta 1 agua fresca. Redemption.createdById =
 * el Staff de la sesión. La idempotencyKey la genera el cliente UNA vez al
 * abrir el modal: reintentos o doble toque nunca descuentan dos veces.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const staff = auth.user;
  let body: RedeemRequest;
  try {
    body = (await req.json()) as RedeemRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  return json(await redeemOne(body.manualCode, body.idempotencyKey, staff.id));
});

export const config: Config = { path: '/api/staff/redeem' };
