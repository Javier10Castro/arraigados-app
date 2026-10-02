import type { Config } from '@netlify/functions';
import { listChurches } from '../../server/attendee';
import { handler, json, methodNotAllowed } from '../../server/http';

/** GET /api/churches -- iglesias de Neon para el buscador del registro. */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  // El catálogo casi no cambia: se puede cachear unos minutos en el navegador.
  return json(await listChurches(), 200, { 'cache-control': 'public, max-age=300' });
});

export const config: Config = { path: '/api/churches' };
