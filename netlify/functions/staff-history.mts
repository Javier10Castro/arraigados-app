import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { staffHistory } from '../../server/staff';
import { handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/staff/history -- "Mis canjes recientes" (Etapa 3). El Staff (o
 * Admin) solo puede ver los SUYOS: el id sale de `authorize()` (la sesión
 * revalidada en el servidor), nunca de la query string.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  return json(await staffHistory(auth.user.id));
});

export const config: Config = { path: '/api/staff/history' };
