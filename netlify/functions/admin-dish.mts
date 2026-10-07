import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { DishValidationError, deleteDish, updateDish } from '../../server/dishes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * PATCH  /api/admin/dishes/:id -> edita un platillo. Mismo formato
 *                                 multipart/form-data que crear; el campo
 *                                 "image" solo se envía si se está
 *                                 REEMPLAZANDO la foto actual (si no viene,
 *                                 la imagen existente se conserva).
 * DELETE /api/admin/dishes/:id -> elimina el platillo y, si tenía, su foto
 *                                 en Netlify Blobs.
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  // Sin id = 404 (ver admin-batch.mts: netlify dev reintenta los 404 como estáticos).
  if (!id) return apiError('Ese platillo no existe.', 404);

  if (req.method === 'PATCH') {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const dish = await updateDish(id, form, auth.user.id);
      return json({ dish });
    } catch (err) {
      if (err instanceof DishValidationError) return apiError(err.message, 400);
      throw err;
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteDish(id, auth.user.id);
      return json({ ok: true });
    } catch (err) {
      if (err instanceof DishValidationError) return apiError(err.message, 404);
      throw err;
    }
  }

  return methodNotAllowed('PATCH, DELETE');
});

export const config: Config = { path: '/api/admin/dishes/:id' };
