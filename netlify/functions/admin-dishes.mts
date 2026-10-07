import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { DishValidationError, createDish, listDishesAdmin, listVenues } from '../../server/dishes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET  /api/admin/dishes -> lista TODOS los platillos (disponibles y no) +
 *                           el catálogo de sedes (fijo, 2 filas) para el
 *                           selector del formulario.
 * POST /api/admin/dishes -> crea un platillo. Body multipart/form-data (NO
 *                           JSON, para poder llevar el archivo de imagen):
 *                           name, description, price (centavos), available
 *                           ('true'/'false'), venueId, image (opcional).
 * Solo ADMIN.
 */
export default handler(async (req: Request) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') {
    const [dishes, venues] = await Promise.all([listDishesAdmin(), listVenues()]);
    return json({ dishes, venues });
  }

  if (req.method === 'POST') {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const dish = await createDish(form, auth.user.id);
      return json({ dish }, 201);
    } catch (err) {
      if (err instanceof DishValidationError) return apiError(err.message, 400);
      throw err;
    }
  }

  return methodNotAllowed('GET, POST');
});

export const config: Config = { path: '/api/admin/dishes' };
