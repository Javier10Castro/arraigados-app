import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { handler, json, methodNotAllowed } from '../../server/http';

/** GET /api/auth/me -- usuario de Staff/Admin de la sesión (revalidado en Neon). */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN', 'STAFF'], { allowPending: true });
  if ('response' in auth) return auth.response;
  const { passwordHash: _omit, ...user } = auth.user;
  return json(user);
});

export const config: Config = { path: '/api/auth/me' };
