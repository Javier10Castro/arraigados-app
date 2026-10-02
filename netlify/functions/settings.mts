import type { Config } from '@netlify/functions';
import { getSettings } from '../../server/settings';
import { handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/settings -- configuración global de la app (hoy: modo de avatar).
 * Pública a propósito: la usan también las pantallas del asistente, que no
 * tienen sesión de Staff. No contiene datos sensibles. Para CAMBIARLA:
 * PATCH /api/admin/settings (solo ADMIN).
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  return json(await getSettings());
});

export const config: Config = { path: '/api/settings' };
