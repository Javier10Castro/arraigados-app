import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { SelfRedeemError, getOverview, setGlobal, setOverride } from '../../server/selfRedeem';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guardUser } from '../../server/rateLimit';
import type { UpdateSelfRedeemRequest } from '../../shared/api';

/**
 * Autocanje de Staff/Admin (escanear la propia pulsera).
 *   GET   -> interruptores globales por rol (cualquier Admin). La lista por persona con sus excepciones SOLO para la
 *            cuenta propietaria.
 *   PATCH { scope:'global', role, allowed }            -> cualquier Admin autorizado.
 *   PATCH { scope:'user', userId, mode }               -> SOLO la cuenta propietaria (validado en el servidor con el correo
 *                                                         de la sesión; no depende de lo que muestre la interfaz).
 * Cambiar el interruptor global NO toca las excepciones individuales. Cada cambio queda en AuditLog.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed('GET, PATCH');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') return json(await getOverview(auth.user.email));

  const blocked = await guardUser(RULES.admin_user_w, auth.user.id);
  if (blocked) return blocked;
  let body: UpdateSelfRedeemRequest;
  try {
    body = (await req.json()) as UpdateSelfRedeemRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    if (body?.scope === 'global') await setGlobal(auth.user.id, body.role, body.allowed);
    else if (body?.scope === 'user') await setOverride({ id: auth.user.id, email: auth.user.email }, body.userId, body.mode);
    else return apiError('Solicitud inválida.');
    return json(await getOverview(auth.user.email));
  } catch (err) {
    if (err instanceof SelfRedeemError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/selfredeem' };
