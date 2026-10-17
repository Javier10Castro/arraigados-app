import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { lookupPulse } from '../../server/staff';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, record, scope } from '../../server/rateLimit';

/** GET /api/staff/pulse?token=…  o  ?code=AR26-XXXXX-- datos para el modal de canje. */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const code = url.searchParams.get('code');
  if (token === null && code === null) return apiError('Falta el QR o el código.');
  // staff_lookup: escaneos/búsquedas por minuto. staff_miss: solo los códigos que NO existen (adivinar códigos manuales).
  const blocked = await guard([
    { rule: RULES.staff_lookup, id: scope(auth.user.id) },
    { rule: RULES.staff_miss, id: scope(auth.user.id), inc: 0 },
  ]);
  if (blocked) return blocked;
  const found = await lookupPulse(token !== null ? { token } : { code: code ?? '' }, { id: auth.user.id, role: auth.user.role });
  if (found.status === 'not_found') await record([{ rule: RULES.staff_miss, id: scope(auth.user.id) }]);
  return json(found);
});

export const config: Config = { path: '/api/staff/pulse' };
