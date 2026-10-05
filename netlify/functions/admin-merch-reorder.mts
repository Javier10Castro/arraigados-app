import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { MerchValidationError, moveMerchItem } from '../../server/merch';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * POST /api/admin/merch/:id/reorder -> sube/baja un artículo un lugar en la
 * vitrina (intercambia su "sortOrder" con el vecino inmediato). Body JSON:
 * { "dir": -1 | 1 }. Ruta propia (en vez de meterlo en el PATCH de
 * admin-merch-item.mts) porque esto es una acción de lista, no una edición
 * del formulario -- así el botón de subir/bajar no tiene que reenviar
 * nombre/descripción/fotos solo para mover una posición. Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Ese artículo no existe.', 404);

  if (req.method !== 'POST') return methodNotAllowed('POST');

  let body: { dir?: number };
  try {
    body = await req.json();
  } catch {
    return apiError('Solicitud inválida.');
  }
  const dir = body.dir === -1 || body.dir === 1 ? body.dir : null;
  if (dir === null) return apiError('Dirección inválida.');

  try {
    await moveMerchItem(id, dir);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof MerchValidationError) return apiError(err.message, 404);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/merch/:id/reorder' };
