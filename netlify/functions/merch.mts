import type { Config } from '@netlify/functions';
import { listMerchPublic } from '../../server/merch';
import { handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/merch -> catálogo completo de "Mercancía oficial", pública (sin
 * autenticación) -- la consume la vitrina de /home (ver
 * src/pages/home/MerchCarousel.tsx). A diferencia de /api/menu, no filtra
 * por disponibilidad: Merch no tiene un concepto de "oculto", todo artículo
 * creado en /admin/merch se muestra (con su "availability" tal cual, para
 * que la tarjeta pueda decir "Por definir").
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const items = await listMerchPublic();
  return json({ items });
});

export const config: Config = { path: '/api/merch' };
