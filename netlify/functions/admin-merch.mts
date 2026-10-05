import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { MerchValidationError, createMerchItem, listMerchAdmin } from '../../server/merch';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET  /api/admin/merch -> lista TODOS los artículos (con sus fotos).
 * POST /api/admin/merch -> crea un artículo. Body multipart/form-data (NO
 *                          JSON, para poder llevar fotos): name,
 *                          description, price (centavos, puede venir vacío
 *                          = "Por definir"), availability ('tbd'/'onsite'),
 *                          images (0 o más archivos).
 * Solo ADMIN.
 */
export default handler(async (req: Request) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') {
    const items = await listMerchAdmin();
    return json({ items });
  }

  if (req.method === 'POST') {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const item = await createMerchItem(form);
      return json({ item }, 201);
    } catch (err) {
      if (err instanceof MerchValidationError) return apiError(err.message, 400);
      throw err;
    }
  }

  return methodNotAllowed('GET, POST');
});

export const config: Config = { path: '/api/admin/merch' };
