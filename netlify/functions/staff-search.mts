import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { searchActive } from '../../server/staff';
import { handler, json, methodNotAllowed } from '../../server/http';

/** GET /api/staff/search?q=nombre&churchId=… -- asistentes con pulsera activa. */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);
  return json(await searchActive(url.searchParams.get('q') ?? '', url.searchParams.get('churchId') ?? ''));
});

export const config: Config = { path: '/api/staff/search' };
