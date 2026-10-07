import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { MerchValidationError, deleteMerchItem, updateMerchItem } from '../../server/merch';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * PATCH  /api/admin/merch/:id -> edita un artículo Y su galería de fotos en
 *                                 un solo request -- ver updateMerchItem en
 *                                 server/merch.ts para el formato exacto de
 *                                 "removeImageIds"/"imageOrder"/"images".
 * DELETE /api/admin/merch/:id -> elimina el artículo y todas sus fotos.
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Ese artículo no existe.', 404);

  if (req.method === 'PATCH') {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const item = await updateMerchItem(id, form, auth.user.id);
      return json({ item });
    } catch (err) {
      if (err instanceof MerchValidationError) return apiError(err.message, 400);
      throw err;
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteMerchItem(id, auth.user.id);
      return json({ ok: true });
    } catch (err) {
      if (err instanceof MerchValidationError) return apiError(err.message, 404);
      throw err;
    }
  }

  return methodNotAllowed('PATCH, DELETE');
});

export const config: Config = { path: '/api/admin/merch/:id' };
