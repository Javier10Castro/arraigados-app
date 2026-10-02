import type { Config } from '@netlify/functions';
import { clearCookie } from '../../server/auth';
import { handler, json, methodNotAllowed } from '../../server/http';

/** POST /api/auth/logout */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(req) });
});

export const config: Config = { path: '/api/auth/logout' };
