import type { Config, Context } from '@netlify/functions';
import { getDishImage } from '../../server/dishes';

/**
 * GET /api/dish-image/:key -> sirve el archivo de un platillo desde Netlify
 * Blobs (store "dish-photos"). PÚBLICA a propósito, sin autenticación: la
 * consume una <img> normal tanto en /admin/menu como, en la siguiente fase,
 * el carrusel de /home -- ninguna de las dos puede mandar cookies/headers
 * especiales a una <img src="...">.
 *
 * Cache-Control agresivo porque la key cambia en cada reemplazo de foto (ver
 * server/dishes.ts) -- nunca se sirve una key vieja con contenido nuevo.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') return new Response('Método no permitido.', { status: 405 });

  const key = context.params.key ?? '';
  if (!key) return new Response('No encontrada.', { status: 404 });

  const found = await getDishImage(key);
  if (!found) return new Response('No encontrada.', { status: 404 });

  return new Response(found.blob, {
    headers: {
      'content-type': found.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};

export const config: Config = { path: '/api/dish-image/:key' };
