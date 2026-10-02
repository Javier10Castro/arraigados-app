import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { lookupPulse } from '../../server/staff';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/** GET /api/staff/pulse?token=…  o  ?code=AR26-XXXXX -- datos para el modal de canje. */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const code = url.searchParams.get('code');
  if (token === null && code === null) return apiError('Falta el QR o el código.');
  return json(await lookupPulse(token !== null ? { token } : { code: code ?? '' }));
});

export const config: Config = { path: '/api/staff/pulse' };
