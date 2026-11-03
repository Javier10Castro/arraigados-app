import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { heartbeat } from '../../server/adminPresence';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * POST /api/admin/presence { path } -> «latido» del panel de Admin (cada ~15 s mientras está abierto).
 * Responde quién está en línea (y en qué sección) y mis mensajes sin leer. Solo ADMIN. Ver server/adminPresence.ts.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  let body: { path?: unknown } = {};
  try {
    body = (await req.json()) as { path?: unknown };
  } catch {
    return apiError('Solicitud inválida.');
  }
  return json(await heartbeat(auth.user, body?.path));
});

export const config: Config = { path: '/api/admin/presence' };
