import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { redeemOne } from '../../server/staff';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, scope } from '../../server/rateLimit';
import { normalizeStaffCode, type RedeemRequest } from '../../shared/api';

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
  // Frenos contra automatización (NO sustituyen la idempotencyKey ni el UPDATE condicional de redeemOne):
  // por cuenta de Staff y por pulsera. Un doble toque legítimo no gasta nada extra de saldo.
  const code = normalizeStaffCode(body?.manualCode);
  const blocked = await guard([
    { rule: RULES.staff_redeem, id: scope(staff.id) },
    ...(code ? [{ rule: RULES.redeem_pulse, id: scope('pulse', code) }] : []),
  ]);
  if (blocked) return blocked;
  // Quien canjea (y su rol, para el permiso de autocanje) sale SIEMPRE de la sesión; el cuerpo solo trae código y llave.
  return json(await redeemOne(body.manualCode, body.idempotencyKey, { id: staff.id, role: staff.role }));
});

export const config: Config = { path: '/api/staff/redeem' };
