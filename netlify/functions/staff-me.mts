import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { getStaffMe } from '../../server/staffPulse';
import { handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/staff-me -- la pulsera PROPIA de la cuenta del equipo en sesión (Staff o Admin) para la experiencia de
 * visitante (Beneficios, saldo de aguas). Credencial: la cookie de Staff (authorize). El id y el rol salen de la sesión
 * verificada; este endpoint NO acepta ningún identificador del cliente, así que nadie puede consultar la pulsera ajena.
 * Una cuenta con cambio de contraseña pendiente recibe 403 (authorize). No es una credencial de asistente: /api/me y el
 * resto de rutas de asistente siguen exigiendo el token de pulsera.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  return json(await getStaffMe(auth.user));
});

export const config: Config = { path: '/api/staff-me' };
