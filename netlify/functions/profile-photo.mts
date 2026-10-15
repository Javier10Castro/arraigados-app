import type { Config, Context } from '@netlify/functions';
import { readPhoto, verifyPhotoSignature } from '../../server/profile';

/**
 * GET /api/profile-photo/:key?e=<caducidad>&s=<firma> -> la foto de perfil (JPEG).
 * PRIVADA: no hay forma de pedirla sin una URL firmada por el servidor (se entrega solo a asistentes
 * con sesión activa o staff, dentro de /api/me y /api/profiles) y esa firma caduca en 24-48 h.
 * La <img> no puede mandar cabeceras, por eso la credencial va en la propia URL.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') return new Response('Método no permitido.', { status: 405 });
  const key = context.params.key ?? '';
  const url = new URL(req.url);
  if (!verifyPhotoSignature(key, url.searchParams.get('e'), url.searchParams.get('s'))) {
    return new Response('No disponible.', { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  const found = await readPhoto(key);
  if (!found) return new Response('No encontrada.', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(found.data, {
    headers: {
      'content-type': 'image/jpeg',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=43200',
    },
  });
};

export const config: Config = { path: '/api/profile-photo/:key' };
