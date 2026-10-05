import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { DishValidationError, autoFetchDishImage } from '../../server/dishes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { AutoImageSearchRequest } from '../../shared/api';

/**
 * POST /api/admin/dish-image-search -> busca automáticamente una foto para
 * un platillo (Openverse, cualquier licencia -- uso interno, ver
 * server/openverseSearch.ts) cuando el admin no subió una a mano.
 *
 * OJO: a propósito NO vive bajo /api/admin/dishes/* -- esa familia de rutas
 * incluye admin-dish.mts en '/api/admin/dishes/:id', y Netlify la hace
 * coincidir con CUALQUIER siguiente segmento (incluido "search-image"),
 * interceptando la petición antes de que llegue aquí (esa función solo
 * acepta PATCH/DELETE, así que respondía 405 "Método no permitido"). Si se
 * vuelve a anidar esto bajo /api/admin/dishes/, hay que revisar esa colisión.
 *
 * Body JSON: { query: string, exclude?: string[] } (normalmente el nombre
 * del platillo; "exclude" son los sourceId de Openverse que "Buscar otra" ya
 * mostró, para no repetir foto).
 * Respuesta: { result: AutoImageSearchResponse | null } -- null = no se
 * encontró ninguna foto utilizable para ese término.
 *
 * Esto es solo una VISTA PREVIA: ya queda guardada en Blobs (para poder
 * mostrarla), pero el platillo no se crea/edita aquí -- eso pasa cuando el
 * admin manda el formulario normal con "useImageKey" (ver server/dishes.ts).
 * Solo ADMIN.
 */
export default handler(async (req: Request) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (req.method !== 'POST') return methodNotAllowed('POST');

  let body: AutoImageSearchRequest;
  try {
    body = (await req.json()) as AutoImageSearchRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }

  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((x): x is string => typeof x === 'string') : [];

  try {
    const result = await autoFetchDishImage(body.query ?? '', exclude);
    return json({ result });
  } catch (err) {
    if (err instanceof DishValidationError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/dish-image-search' };
