import type { Config } from '@netlify/functions';
import { listMenuPublic } from '../../server/dishes';
import { handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/menu -> platillos DISPONIBLES, pública (sin autenticación).
 *
 * Lista para que la consuma el carrusel de /home en la siguiente fase --
 * esta función ya queda funcionando end-to-end, pero por ahora nada en
 * /home la llama todavía (alcance explícito de esta entrega, 3 oct 2026).
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const dishes = await listMenuPublic();
  return json({ dishes });
});

export const config: Config = { path: '/api/menu' };
