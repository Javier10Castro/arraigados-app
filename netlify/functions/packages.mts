import type { Config } from '@netlify/functions';
import { listActivePackages } from '../../server/attendee';
import { handler, json, methodNotAllowed } from '../../server/http';

/** GET /api/packages -- paquetes activos (nombre, precio en centavos, bebidas). */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  return json(await listActivePackages());
});

export const config: Config = { path: '/api/packages' };
