import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { getStaffPulseInfo, linkStaffPulse, replaceStaffPulse, unlinkStaffPulse } from '../../server/staffPulse';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guardUser } from '../../server/rateLimit';
import type { StaffPulseLinkRequest } from '../../shared/api';

/**
 * Pulsera de una cuenta del equipo. SOLO Admin (authorize(['ADMIN']) revalida el rol en el servidor).
 *   GET    ?userId=…            -> qué pulsera tiene esa cuenta
 *   POST   { userId, code }     -> vincular (la cuenta no debe tener otra; la pulsera debe estar libre y sin asistente)
 *   PUT    { userId, code }     -> reemplazar por otra del mismo kit
 *   DELETE ?userId=…            -> desvincular
 * Cada cambio queda en AuditLog (sin tokens). El actor sale de la sesión, nunca del cuerpo.
 */
export default handler(async (req: Request) => {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return methodNotAllowed('GET, POST, PUT, DELETE');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const userId = url.searchParams.get('userId') ?? '';
    if (!userId) return apiError('Falta la cuenta.');
    return json(await getStaffPulseInfo(userId));
  }

  const blocked = await guardUser(RULES.admin_user_w, auth.user.id);
  if (blocked) return blocked;

  if (req.method === 'DELETE') {
    const userId = url.searchParams.get('userId') ?? '';
    if (!userId) return apiError('Falta la cuenta.');
    return json(await unlinkStaffPulse(auth.user.id, userId));
  }

  let body: StaffPulseLinkRequest;
  try {
    body = (await req.json()) as StaffPulseLinkRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  if (!body || typeof body.userId !== 'string' || typeof body.code !== 'string') return apiError('Solicitud inválida.');
  const result = req.method === 'POST' ? await linkStaffPulse(auth.user.id, body.userId, body.code) : await replaceStaffPulse(auth.user.id, body.userId, body.code);
  return json(result);
});

export const config: Config = { path: '/api/admin/staff-pulse' };
