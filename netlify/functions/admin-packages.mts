import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { listKitsAdmin } from '../../server/packages';
import { handler, json, methodNotAllowed } from '../../server/http';

/** GET /api/admin/packages -> kits con sus números en vivo (solo lectura). Solo ADMIN. */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  return json(await listKitsAdmin());
});

export const config: Config = { path: '/api/admin/packages' };
