import type { Config, Context } from '@netlify/functions';
import { getMerchImage } from '../../server/merch';

/**
 * GET /api/merch-image/:key -> sirve una foto de mercancía desde Netlify
 * Blobs (store "merch-photos"). PÚBLICA a propósito -- la consume una <img>
 * normal tanto en /admin/merch como en la vitrina de /home. Ver
 * netlify/functions/dish-image.mts (mismo patrón exacto).
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') return new Response('Método no permitido.', { status: 405 });

  const key = context.params.key ?? '';
  if (!key) return new Response('No encontrada.', { status: 404 });

  const found = await getMerchImage(key);
  if (!found) return new Response('No encontrada.', { status: 404 });

  return new Response(found.blob, {
    headers: {
      'content-type': found.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};

export const config: Config = { path: '/api/merch-image/:key' };
